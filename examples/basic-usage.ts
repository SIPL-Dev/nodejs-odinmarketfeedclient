
import { ODINMarketFeedClient } from "../src/ODINMarketFeedClient";

async function main() {

  const client = new ODINMarketFeedClient();

  // Set up event handlers
  client.onOpen = async () => {
    console.log('✅ Connected to WebSocket server');

    const tokenList: string[] = new Array<string>();
    tokenList.push("1_22");
    tokenList.push("1_2885");
    await client.subscribeTouchline(tokenList);
    //await client.subscribeTouchline(tokenList, "1");
    //await client.subscribeTouchline(tokenList, "0", true);
    //await client.subscribeBestFive("22", 1);
    //await client.subscribeLTPTouchline(tokenList);
    //await new Promise(resolve => setTimeout(resolve, 10000));
    //setTimeout( async ()=> { await client.subscribePauseResume(true); setTimeout( async ()=> { await client.subscribePauseResume(false);  }, 10000)   }, 20000) 

  };

  client.onMessage = (message: string) => {
    console.log('📨 Received:', message);
  };

  client.onError = (error: string) => {
    console.error('❌ Error:', error);
  };

  client.onClose = (code: number, reason: string) => {
    console.log(`🔌 Connection closed: ${code} - ${reason}`);
  };

  try {
    // Connect to your server
    //var config = new ConnectionConfig();
    await client.connect('172.25.100.43', 4509, false, 'PRAJYOT','');

    // Subscribe to tokens
    // const tokenList = "1_22,1_2885";
    // const tokens = tokenList.split(',');
    // let subscribeMsg = "";

    // for (const item of tokens) {
    //   const [marketSegId, token] = item.split('_');
    //   subscribeMsg += `1=${marketSegId}$7=${token}|`;
    // }

    // const currentTime = new Date().toLocaleTimeString('en-US', { 
    //   hour12: false, 
    //   hour: '2-digit', 
    //   minute: '2-digit', 
    //   second: '2-digit' 
    // });

    // const request = `63=FT3.0|64=206|65=84|66=${currentTime}|4=|${subscribeMsg}230=1`;
    // await client.sendMessage(request);
    //var arrtoknList = ["1_22","1_2885"]
    //await client.subscribeTouchline(arrtoknList);


    // Keep connection alive
    console.log('💤 Keeping connection alive for 60 seconds...');
    await new Promise(resolve => setTimeout(resolve, 60000));

  } catch (error) {
    console.error('💥 Failed:', error);
  } finally {
    await client.disconnect();
    console.log('👋 Disconnected');
  }
}

main();