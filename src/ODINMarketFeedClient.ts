import WebSocket from 'ws';
import { deflateSync, inflateSync } from 'zlib';

export enum CompressionStatus {
  ON = 'ON',
  OFF = 'OFF'
}

export interface MarketData {
  mktSegId: number;
  token: number;
  lut: number;
  ltp: number;
  closePrice: number;
  decimalLocator: number;
}

class ZLIBCompressor {
  compress(data: Buffer): Buffer {
    return deflateSync(data);
  }

  uncompress(data: Buffer): Buffer {
    return inflateSync(data);
  }
}

class FragmentationHandler {
  private memoryStream: Buffer;
  private lastWrittenIndex: number;
  private isDisposed: boolean;
  private zlibCompressor: ZLIBCompressor;

  private static readonly MINIMUM_PACKET_SIZE = 5;
  private static readonly PACKET_HEADER_SIZE = 5;

  constructor() {
    this.memoryStream = Buffer.alloc(0);
    this.lastWrittenIndex = -1;
    this.isDisposed = false;
    this.zlibCompressor = new ZLIBCompressor();
  }

  fragmentData(data: Buffer): Buffer {
    const compressed = this.zlibCompressor.compress(data);
    const lengthString = compressed.length.toString().padStart(6, '0');
    const lenBytes = Buffer.from(lengthString, 'ascii');
    lenBytes[0] = 5; // compression flag

    return Buffer.concat([lenBytes, compressed]);
  }

  defragment(data: Buffer): Buffer[] {
    if (this.isDisposed) {
      return [];
    }

    // Append data to memory stream
    const newStream = Buffer.alloc(this.lastWrittenIndex + 1 + data.length);
    if (this.lastWrittenIndex >= 0) {
      this.memoryStream.copy(newStream, 0, 0, this.lastWrittenIndex + 1);
    }
    data.copy(newStream, this.lastWrittenIndex + 1);
    this.memoryStream = newStream;
    this.lastWrittenIndex = this.memoryStream.length - 1;

    return this.defragmentData();
  }

  private defragmentData(): Buffer[] {
    let parseDone = false;
    let bytesParsed = 0;
    const packetList: Buffer[] = [];
    let position = 0;

    while (
      position < this.lastWrittenIndex - FragmentationHandler.MINIMUM_PACKET_SIZE &&
      !parseDone
    ) {
      const headerEnd = position + FragmentationHandler.PACKET_HEADER_SIZE + 1;
      if (headerEnd > this.memoryStream.length) {
        break;
      }

      const header = this.memoryStream.slice(position, headerEnd);
      const packetSize = this.isLength(header);

      if (packetSize <= 0) {
        position += 1;
        bytesParsed += 1;
      } else {
        const dataStart = headerEnd;
        const dataEnd = dataStart + packetSize;

        if (dataEnd <= this.lastWrittenIndex + 1) {
          const compressData = this.memoryStream.slice(dataStart, dataEnd);
          this.defragmentInnerData(compressData, packetList);
          bytesParsed += FragmentationHandler.PACKET_HEADER_SIZE + 1 + packetSize;
          position = dataEnd;
        } else {
          parseDone = true;
        }
      }
    }

    this.clearProcessedData(bytesParsed);
    return packetList;
  }

  private isLength(header: Buffer): number {
    if (header.length !== FragmentationHandler.PACKET_HEADER_SIZE + 1) {
      return -1;
    }

    if (header[0] !== 5 && header[0] !== 2) {
      return -1;
    }

    const lengthStr = header.slice(1, 6).toString('ascii');
    if (!/^\d+$/.test(lengthStr)) {
      return -1;
    }

    return parseInt(lengthStr, 10);
  }



  private readonly _HeaderLength: number = 6;
  private defragmentInnerData(compressData: Buffer, packetList: Buffer[]): void {
    try {
      let MessageData = this.zlibCompressor.uncompress(compressData);
      //packetList.push(messageData);

      let m_UnCompressMsgLength: number;
      let packetCount: number = 0;

      while (true) {

        m_UnCompressMsgLength = 0;
        m_UnCompressMsgLength = this.GetMessageLength(MessageData);

        if (m_UnCompressMsgLength <= 0) {
          //MessageData = null;
          break;
        }

        // Extract the uncompressed bytes
        const unCompressBytes = Buffer.alloc(m_UnCompressMsgLength);
        MessageData.copy(unCompressBytes, 0, this._HeaderLength, this._HeaderLength + m_UnCompressMsgLength);


        packetList.push(unCompressBytes);
        packetCount++;

        // Calculate remaining data length
        const remainingLength = MessageData.length - m_UnCompressMsgLength - this._HeaderLength;

        if (remainingLength <= 0) {
          //MessageData = null;
          break;
        }

        // Extract remaining data
        const unCompressNewBytes = Buffer.alloc(remainingLength);
        unCompressNewBytes.set(MessageData.subarray(m_UnCompressMsgLength + this._HeaderLength));

        MessageData = unCompressNewBytes;

      }


    } catch (error) {
      console.error('Error decompressing data:', error);
    }
  }

  private headerChar: string[] = new Array(5);
  
  private GetMessageLength(message: Buffer): number {

    try {
      let i: number = 1;
      let startIndex: number = 0;

      for (; i < this._HeaderLength; i++) {
        this.headerChar[startIndex] = String.fromCharCode(message[i]);
        startIndex++;
      }

      const sLength = this.headerChar.slice(0, startIndex).join('');
      const iLength = parseInt(sLength, 10);

      return iLength;
    } catch {
      return 0;
    }
  }

  private clearProcessedData(length: number): void {
    if (length <= 0) {
      return;
    }

    if (length >= this.lastWrittenIndex + 1) {
      this.lastWrittenIndex = -1;
      this.memoryStream = Buffer.alloc(0);
      return;
    }

    const size = this.lastWrittenIndex + 1 - length;
    const data = this.memoryStream.slice(length, length + size);
    this.memoryStream = Buffer.from(data);
    this.lastWrittenIndex = size - 1;
  }
}

export class ODINMarketFeedClient {
  private ws: WebSocket | null = null;
  //private compressionStatus: CompressionStatus = CompressionStatus.ON;
  private userId: string = '';
  private isDisposed: boolean = false;
  private fragHandler: FragmentationHandler;

  public onOpen?: () => void;
  public onMessage?: (message: string) => void;
  public onError?: (error: string) => void;
  public onClose?: (code: number, reason: string) => void;

  constructor() {
    this.fragHandler = new FragmentationHandler();
  }

  // setCompression(enabled: boolean): void {
  //   this.compressionStatus = enabled ? CompressionStatus.ON : CompressionStatus.OFF;
  // }

  async connect(host: string, port: number, useSSL: boolean, userId: string, apiKey: string): Promise<void> {

    // Input validation
    if (!host || host.trim() === "") {
      this.onError?.("Host cannot be null or empty.");
      return;
    }

    if (port <= 0 || port > 65535) {
      this.onError?.("Port must be between 1 and 65535.");
      return;
    }

    if (!userId || userId.trim() === "") {
      this.onError?.("User ID cannot be null or empty.");
      return;
    }

    // Hostname/IP validation
    const dnsRegex = /^(?!:\/\/)([a-zA-Z0-9-_\.]+)$/;
    const ipv4Regex = /^(25[0-5]|2[0-4]\d|[01]?\d\d?)\.(25[0-5]|2[0-4]\d|[01]?\d\d?)\.(25[0-5]|2[0-4]\d|[01]?\d\d?)\.(25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
    const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|::1)$/;

    if (!(dnsRegex.test(host) || ipv4Regex.test(host) || ipv6Regex.test(host))) {
      this.onError?.("Host must be a valid hostname or IP address.");
      return;
    }

    this.userId = userId;
    const protocol = useSSL ? 'wss' : 'ws';
    const url = `${protocol}://${host}:${port}`;

    return new Promise((resolve, reject) => {
      try {

        console.log('Connecting to ', url);
        this.ws = new WebSocket(url);

        this.ws.on('open', async () => {
          console.log('Connected');
          const currentTime = this.formatTime(new Date());

          let password = "68=";
          if (apiKey && apiKey.trim() !== "") {
            password = `68=${apiKey}|401=2`;
          }
          // Send login message
          const loginMsg = `63=FT3.0|64=101|65=74|66=${currentTime}|67=${this.userId}|${password}`;
          await this.sendMessage(loginMsg);

          this.onOpen?.();
          resolve();
        });

        this.ws.on('message', (data: Buffer) => {
          this.responseReceived(data);
        });

        this.ws.on('error', (error: Error) => {
          const errorMsg = `Connection error: ${error.message}`;
          console.error(errorMsg);
          this.onError?.(errorMsg);
          reject(error);
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
          console.log(`Connection closed: ${code} - ${reason.toString()}`);
          this.onClose?.(code, reason.toString());
        });
      } catch (error: any) {
        const errorMsg = `Connection failed: ${error.message}`;
        this.onError?.(errorMsg);
        reject(error);
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return new Promise((resolve) => {
        this.ws!.close(1000, 'Normal closure');
        this.ws!.once('close', () => resolve());
      });
    }
  }

  async subscribeTouchlineOld(tokenList: string[]): Promise<void> {
    if (!tokenList || tokenList.length === 0) {
      this.onError?.("Token list cannot be null or empty.");
      return;
    }

    let strTokenToSubscribe = "";

    for (const item of tokenList) {
      if (!item || item.trim() === "") {
        continue;
      }

      const parts = item.split('_');
      if (parts.length !== 2) {
        this.onError?.(`Invalid token format: '${item}'. Expected format: 'MarketSegmentID_Token'.`);
        continue;
      }

      const marketSegmentId = parseInt(parts[0], 10);
      const token = parseInt(parts[1], 10);

      if (isNaN(marketSegmentId) || isNaN(token)) {
        this.onError?.(`Invalid token format: '${item}'. Expected format: 'MarketSegmentID_Token'.`);
        continue;
      }

      strTokenToSubscribe += `1=${marketSegmentId}$7=${token}|`;
    }

    if (strTokenToSubscribe !== "") {
      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0]; // HH:mm:ss format
      const tlRequest = `63=FT3.0|64=206|65=84|66=${timeStr}|4=|${strTokenToSubscribe}230=1`;

      await this.sendMessage(tlRequest);
      console.log("Subscribed to touchline tokens: " + tokenList.join(", "));
    } else {
      this.onError?.("No valid tokens found to subscribe.");
    }
  }

  /**
 * Send Touchline request for market data
 * @param tokenList List Token to subscribe (1_22,1_2885)
 * @param responseType 1 = Touchline with fixed length native data (refer response structure in section 4.5.3.5) 0 = Normal touchline(refer response structure in section 4.5.3.4)
 * @param LTPChangeOnly Send Touchline Response on LTP change if true, otherwise send all market data response
 */
  public async subscribeTouchline(
    tokenList: string[],
    responseType: string = "0",
    LTPChangeOnly: boolean = false
  ): Promise<void> {
    if (!tokenList || tokenList.length === 0) {
      this.onError?.("Token list cannot be null or empty.");
      return;
    }

    if (responseType !== "0" && responseType !== "1") {
      this.onError?.("Invalid response type passed. Valid values are 0 or 1");
      return;
    }

    let strTokenToSubscribe = "";

    for (const item of tokenList) {
      if (this.isNullOrWhiteSpace(item))
        continue;

      const parts = item.split('_');

      if (parts.length !== 2) {
        this.onError?.(`Invalid token format: '${item}'. Expected format: 'MarketSegmentID_Token'.`);
        continue;
      }

      const marketSegmentId = parseInt(parts[0], 10);
      const token = parseInt(parts[1], 10);

      if (isNaN(marketSegmentId) || isNaN(token)) {
        this.onError?.(`Invalid token format: '${item}'. Expected format: 'MarketSegmentID_Token'.`);
        continue;
      }

      strTokenToSubscribe += `1=${marketSegmentId}$7=${token}|`;
    }

    let strResponseType = "";
    if (responseType === "1") {
      strResponseType = "49=1";
    }

    const sLTChangeOnly = LTPChangeOnly ? "200=1" : "200=0";

    if (strTokenToSubscribe.length > 0) {
      const currentTime = this.formatTime(new Date());
      let tlRequest = "";

      if (strResponseType !== "") {
        tlRequest = `63=FT3.0|64=206|65=84|66=${currentTime}|${strResponseType}|${sLTChangeOnly}|${strTokenToSubscribe}230=1`;
      } else {
        tlRequest = `63=FT3.0|64=206|65=84|66=${currentTime}|${sLTChangeOnly}|${strTokenToSubscribe}230=1`;
      }

      await this.sendMessage(tlRequest);
      console.log("Subscribed to touchline tokens: " + tokenList.join(", "));
    } else {
      this.onError?.("No valid tokens found to subscribe.");
    }
  }


  async unsubscribeTouchline(tokenList: string[]): Promise<void> {
    if (!tokenList || tokenList.length === 0) {
      this.onError?.("Token list cannot be null or empty.");
      return;
    }

    let strTokenToSubscribe = "";

    for (const item of tokenList) {
      if (!item || item.trim() === "") {
        continue;
      }

      const parts = item.split('_');
      if (parts.length !== 2) {
        this.onError?.(`Invalid token format: '${item}'. Expected format: 'MarketSegmentID_Token'.`);
        continue;
      }

      const marketSegmentId = parseInt(parts[0], 10);
      const token = parseInt(parts[1], 10);

      if (isNaN(marketSegmentId) || isNaN(token)) {
        this.onError?.(`Invalid token format: '${item}'. Expected format: 'MarketSegmentID_Token'.`);
        continue;
      }

      strTokenToSubscribe += `1=${marketSegmentId}$7=${token}|`;
    }

    if (strTokenToSubscribe !== "") {
      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0]; // HH:mm:ss format
      const tlRequest = `63=FT3.0|64=206|65=84|66=${timeStr}|4=|${strTokenToSubscribe}230=2`;

      await this.sendMessage(tlRequest);
      console.log("Unsubscribed to touchline tokens: " + tokenList.join(", "));
    } else {
      this.onError?.("No valid tokens found to subscribe.");
    }
  }

  async subscribeBestFive(token: string, marketSegmentId: number): Promise<void> {
    if (!token || token.trim() === "") {
      this.onError?.("token cannot be null or empty.");
      return;
    }

    if (marketSegmentId <= 0) {
      this.onError?.("Invalid MarketSegment.");
      return;
    }

    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0]; // HH:mm:ss format
    const tlRequest = `63=FT3.0|64=127|65=84|66=${timeStr}|1=${marketSegmentId}|7=${token}|230=1`;

    await this.sendMessage(tlRequest);
    console.log(`Subscribed to BestFive tokens: ${token} , MarketSegmentId: ${marketSegmentId}`);
  }

  async unsubscribeBestFive(token: string, marketSegmentId: number): Promise<void> {
    if (!token || token.trim() === "") {
      this.onError?.("token cannot be null or empty.");
      return;
    }

    if (marketSegmentId <= 0) {
      this.onError?.("Invalid MarketSegment.");
      return;
    }

    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0]; // HH:mm:ss format
    const tlRequest = `63=FT3.0|64=127|65=84|66=${timeStr}|1=${marketSegmentId}|7=${token}|230=2`;

    await this.sendMessage(tlRequest);
    console.log(`Unsubscribed to BestFive tokens: ${token} , MarketSegmentId: ${marketSegmentId}`);
  }

  /**
 * Send LTP Touchline request for market data
 * @param tokenList List Token to subscribe (1_22,1_2885)
 */
  public async subscribeLTPTouchline(tokenList: string[]): Promise<void> {
    if (!tokenList || tokenList.length === 0) {
      this.onError?.("Token list cannot be null or empty.");
      return;
    }

    let strTokenToSubscribe = "";

    for (const item of tokenList) {
      if (this.isNullOrWhiteSpace(item))
        continue;

      const parts = item.split('_');

      if (parts.length !== 2) {
        this.onError?.(`Invalid token format: '${item}'. Expected format: 'MarketSegmentID_Token'.`);
        continue;
      }

      const marketSegmentId = parseInt(parts[0], 10);
      const token = parseInt(parts[1], 10);

      if (isNaN(marketSegmentId) || isNaN(token)) {
        this.onError?.(`Invalid token format: '${item}'. Expected format: 'MarketSegmentID_Token'.`);
        continue;
      }

      strTokenToSubscribe += `1=${marketSegmentId}$7=${token}|`;
    }

    if (strTokenToSubscribe.length > 0) {
      const currentTime = this.formatTime(new Date());
      const tlRequest = `63=FT3.0|64=347|65=84|66=${currentTime}|${strTokenToSubscribe}230=1`;
      await this.sendMessage(tlRequest);
      console.log("Subscribed to LTP touchline tokens: " + tokenList.join(", "));
    } else {
      this.onError?.("No valid tokens found to subscribe.");
    }
  }

  public async UnsubscribeLTPTouchline(tokenList: string[]): Promise<void> {
    if (!tokenList || tokenList.length === 0) {
      this.onError?.("Token list cannot be null or empty.");
      return;
    }

    let strTokenToSubscribe = "";

    for (const item of tokenList) {
      if (this.isNullOrWhiteSpace(item))
        continue;

      const parts = item.split('_');

      if (parts.length !== 2) {
        this.onError?.(`Invalid token format: '${item}'. Expected format: 'MarketSegmentID_Token'.`);
        continue;
      }

      const marketSegmentId = parseInt(parts[0], 10);
      const token = parseInt(parts[1], 10);

      if (isNaN(marketSegmentId) || isNaN(token)) {
        this.onError?.(`Invalid token format: '${item}'. Expected format: 'MarketSegmentID_Token'.`);
        continue;
      }

      strTokenToSubscribe += `1=${marketSegmentId}$7=${token}|`;
    }

    if (strTokenToSubscribe.length > 0) {
      const currentTime = this.formatTime(new Date());
      const tlRequest = `63=FT3.0|64=347|65=84|66=${currentTime}|${strTokenToSubscribe}230=2`;
      await this.sendMessage(tlRequest);
      console.log("Unsubscribed to LTP touchline tokens: " + tokenList.join(", "));
    } else {
      this.onError?.("No valid tokens found to subscribe.");
    }
  }

  /**
  * This method can be use to pause or resume the broadcast subscription for user 
  * when portal / app is in minimize mode or broadcast is not needed temporarily.
  * @param isPause true – Pause false – Resume
  */
  public async subscribePauseResume(isPause: boolean): Promise<void> {
    const sIsPause = isPause ? "230=1" : "230=2";
    const currentTime = this.formatTime(new Date());
    const tlRequest = `63=FT3.0|64=106|65=84|66=${currentTime}|${sIsPause}`;

    await this.sendMessage(tlRequest);
    console.log((isPause ? "Pause " : "Resume ") + "request Sent");
  }

  // Helper methods
  private isNullOrWhiteSpace(str: string): boolean {
    return !str || str.trim().length === 0;
  }

  private formatTime(date: Date): string {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  async sendMessage(message: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    console.log('Sending Message:', message);
    const packet = this.fragHandler.fragmentData(Buffer.from(message, 'ascii'));

    return new Promise((resolve, reject) => {
      this.ws!.send(packet, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }


  private dteNSE: Date = new Date("1980-01-01");
  private responseReceived(data: Buffer): void {
    try {
      const arrData = this.fragHandler.defragment(data);

      for (let i = 0; i < arrData.length; i++) {

        let strMsg = arrData[i].toString('ascii');

        if (strMsg.indexOf("|50=") >= 0) {
          const data: Buffer = arrData[i];
          const dataIndex = strMsg.indexOf("|50=") + 4;
          let strNewMsg = strMsg.substring(0, strMsg.indexOf("|50=") + 1);

          const MktSegId = data.readInt32LE(dataIndex).toString();
          strNewMsg += "1=" + MktSegId + "|";

          const token = data.readInt32LE(dataIndex + 4).toString();
          strNewMsg += "7=" + token + "|";

          let LUT = "";
          const lutSeconds = data.readInt32LE(dataIndex + 8);
          const lutDate = new Date(this.dteNSE.getTime() + lutSeconds * 1000);
          LUT = this.formatDate(lutDate);
          strNewMsg += "74=" + LUT + "|";

          let LTT = "";
          const lttSeconds = data.readInt32LE(dataIndex + 12);
          const lttDate = new Date(this.dteNSE.getTime() + lttSeconds * 1000);
          LTT = this.formatDate(lttDate);
          strNewMsg += "73=" + LTT + "|";

          const LTP = data.readInt32LE(dataIndex + 16).toString();
          strNewMsg += "8=" + LTP + "|";

          const BQty = data.readInt32LE(dataIndex + 20).toString();
          strNewMsg += "2=" + BQty + "|";

          const BPrice = data.readInt32LE(dataIndex + 24).toString();
          strNewMsg += "3=" + BPrice + "|";

          const SQty = data.readInt32LE(dataIndex + 28).toString();
          strNewMsg += "5=" + SQty + "|"; // Note: Original code uses BQty here (appears to be a bug)

          const SPrice = data.readInt32LE(dataIndex + 32).toString();
          strNewMsg += "6=" + SPrice + "|"; // Note: Original code uses BPrice here (appears to be a bug)

          const OPrice = data.readInt32LE(dataIndex + 36).toString();
          strNewMsg += "75=" + OPrice + "|"; // Note: Original code uses BQty here (appears to be a bug)

          const HPrice = data.readInt32LE(dataIndex + 40).toString();
          strNewMsg += "77=" + HPrice + "|"; // Note: Original code uses BPrice here (appears to be a bug)

          const LPrice = data.readInt32LE(dataIndex + 44).toString();
          strNewMsg += "78=" + LPrice + "|"; // Note: Original code uses BQty here (appears to be a bug)

          const CPrice = data.readInt32LE(dataIndex + 48).toString();
          strNewMsg += "76=" + CPrice + "|"; // Note: Original code uses BPrice here (appears to be a bug)

          const DecLocator = data.readInt32LE(dataIndex + 52).toString();
          strNewMsg += "399=" + DecLocator + "|";

          const PrvClosePrice = data.readInt32LE(dataIndex + 56).toString();
          strNewMsg += "250=" + PrvClosePrice + "|";

          const IndicativeClosePrice = data.readInt32LE(dataIndex + 60).toString();
          strNewMsg += "88=" + IndicativeClosePrice + "|";

          strMsg = strNewMsg;
        }

        this.onMessage?.(strMsg);
      }

      // for (const packet of arrData) {
      //   const message = packet.toString('ascii');
      //   //console.log(message);
      //   let arrMsg = this.parseData(message);

      //   console.log(message);
      //   for (const msg of arrMsg) {
      //     this.onMessage?.(msg);
      //   }
      // }

    } catch (error) {
      console.error('Error processing response:', error);
    }
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}${minutes}${seconds}`;
  }

  /**
     * Parse incoming data and extract complete messages
     * @param {string} data - Raw data string
     * @returns {Array} Array of parsed messages
     */
  parseData(data: string): Array<any> {
    //this.buffer += data;
    const messages: any = [];
    while (data.length > 6) {
      // Extract length from first 5 characters
      const lengthStr = data.substring(1, 6);
      const messageLength = parseInt(lengthStr, 10);
      //console.log(lengthStr,messageLength);
      // Check if we have a complete message
      const totalLength = 6 + messageLength;
      //break;
      if (data.length < totalLength || isNaN(messageLength)) {
        // Not enough data yet, wait for more
        break;
      }

      // Extract the complete message
      //const fullMessage = data.substring(1, totalLength);
      const messageData = data.substring(6, totalLength);
      //console.log(messageData);
      messages.push(messageData);

      // Remove processed message from buffer
      data = data.substring(totalLength);

    }

    return messages;
  }

  dispose(): void {
    if (!this.isDisposed) {
      this.ws?.close();
      this.isDisposed = true;
    }
  }
}

