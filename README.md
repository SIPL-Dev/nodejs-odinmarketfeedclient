# ODIN Market Feed Client

A TypeScript/Node.js WebSocket client for ODIN Market Feed with real-time market data streaming capabilities.

## Features

- 🚀 Real-time market data streaming via WebSocket
- 📊 Multiple subscription types (Touchline, Best Five, LTP)
- 🗜️ Built-in ZLIB compression support
- 📦 Automatic message fragmentation and defragmentation
- 🔄 Pause/Resume functionality for bandwidth management
- 💪 Type-safe with full TypeScript support
- ⚡ Event-driven architecture

## Installation

```bash
npm install odin-market-feed-client
```

## Quick Start

```typescript
import { ODINMarketFeedClient } from 'odin-market-feed-client';

const client = new ODINMarketFeedClient();

// Set up event handlers
client.onOpen = async () => {
  console.log('Connected to WebSocket server');
  
  const tokenList = ['1_22', '1_2885'];
  await client.subscribeTouchline(tokenList);
};

client.onMessage = (message: string) => {
  console.log('Received:', message);
};

client.onError = (error: string) => {
  console.error('Error:', error);
};

client.onClose = (code: number, reason: string) => {
  console.log(`Connection closed: ${code} - ${reason}`);
};

// Connect to server
async function main() {
  try {
    await client.connect('SERVER-IP', 4509, false, 'your-user-id', 'your-api-key');
    
    // Keep connection alive
    await new Promise(resolve => setTimeout(resolve, 60000));
  } catch (error) {
    console.error('Connection failed:', error);
  } finally {
    await client.disconnect();
  }
}

main();
```

## API Reference

### ODINMarketFeedClient

#### Constructor

```typescript
const client = new ODINMarketFeedClient();
```

#### Methods

##### connect(host, port, useSSL, userId, apiKey)

Establishes a WebSocket connection to the ODIN Market Feed server.

```typescript
await client.connect('SERVER-IP', 'SERVER PORT', false, 'USERID', 'API_KEY');
```

**Parameters:**
- `host` (string): Server hostname or IP address
- `port` (number): Server port number
- `useSSL` (boolean): Whether to use SSL/TLS
- `userId` (string): Your user ID
- `apiKey` (string): Your API key

##### disconnect()

Closes the WebSocket connection gracefully.

```typescript
await client.disconnect();
```

##### subscribeTouchline(tokenList, marketSegmentID?, isUnsubscribe?)

Subscribes to touchline data for specified tokens.

```typescript
const tokens = ['1_22', '1_2885'];
await client.subscribeTouchline(tokens);

// Unsubscribe
await client.unsubscribeTouchline(tokens);
```

**Parameters:**
- `tokenList` (string[]): Array of tokens in format 'MarketSegmentID_Token'


##### subscribeBestFive(token, marketSegmentId)

Subscribes to best five bid/ask prices for a token.

```typescript
await client.subscribeBestFive('22', 1);
```

**Parameters:**
- `token` (string): Token ID
- `marketSegmentId` (number): Market segment ID

##### subscribeLTPTouchline(tokenList)

Subscribes to Last Traded Price (LTP) updates.

```typescript
const tokens = ['1_22', '1_2885'];
await client.subscribeLTPTouchline(tokens);
```

##### UnsubscribeLTPTouchline(tokenList)

Unsubscribes from LTP touchline updates.

```typescript
await client.UnsubscribeLTPTouchline(['1_22']);
```

##### subscribePauseResume(isPause)

Pauses or resumes market data streaming.

```typescript
// Pause
await client.subscribePauseResume(true);

// Resume
await client.subscribePauseResume(false);
```


## Requirements

- Node.js >= 14.0.0
- TypeScript >= 4.0.0 (for development)

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions, please use the [GitHub issue tracker](https://github.com/SIPL-Dev/nodejs-odinmarketfeedclient/issues).

## Disclaimer

This is an official client library. Please ensure you have proper authorization to access ODIN Market Feed services.
