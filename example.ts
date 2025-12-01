import { ODINMarketFeedClient } from '../src/ODINMarketFeedClient';

/**
 * Example: Basic connection and touchline subscription
 */
async function basicExample() {
  const client = new ODINMarketFeedClient();

  client.onOpen = async () => {
    console.log('✅ Connected to WebSocket server');

    const tokenList: string[] = ['1_22', '1_2885'];
    await client.subscribeTouchline(tokenList);
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
    await client.connect('172.25.100.43', 4509, false, 'YOUR_USER_ID', '');
    
    console.log('💤 Keeping connection alive for 60 seconds...');
    await new Promise(resolve => setTimeout(resolve, 60000));
  } catch (error) {
    console.error('💥 Failed:', error);
  } finally {
    await client.disconnect();
    console.log('👋 Disconnected');
  }
}

/**
 * Example: Pause and Resume subscription
 */
async function pauseResumeExample() {
  const client = new ODINMarketFeedClient();

  client.onOpen = async () => {
    console.log('✅ Connected');

    const tokenList = ['1_22'];
    await client.subscribeTouchline(tokenList);

    // Pause after 10 seconds
    setTimeout(async () => {
      console.log('⏸️  Pausing subscription...');
      await client.subscribePauseResume(true);
      
      // Resume after 5 seconds
      setTimeout(async () => {
        console.log('▶️  Resuming subscription...');
        await client.subscribePauseResume(false);
      }, 5000);
    }, 10000);
  };

  client.onMessage = (message: string) => {
    console.log('📨', message);
  };

  client.onError = (error: string) => {
    console.error('❌', error);
  };

  try {
    await client.connect('172.25.100.43', 4509, false, 'YOUR_USER_ID', '');
    await new Promise(resolve => setTimeout(resolve, 30000));
  } catch (error) {
    console.error('💥', error);
  } finally {
    await client.disconnect();
  }
}

/**
 * Example: Subscribe to Best Five
 */
async function bestFiveExample() {
  const client = new ODINMarketFeedClient();

  client.onOpen = async () => {
    console.log('✅ Connected');
    await client.subscribeBestFive('22', 1);
  };

  client.onMessage = (message: string) => {
    console.log('📊 Best Five Data:', message);
  };

  client.onError = (error: string) => {
    console.error('❌', error);
  };

  try {
    await client.connect('172.25.100.43', 4509, false, 'YOUR_USER_ID', '');
    await new Promise(resolve => setTimeout(resolve, 30000));
  } catch (error) {
    console.error('💥', error);
  } finally {
    await client.disconnect();
  }
}

// Run the example
// Uncomment the example you want to run:
basicExample();
// pauseResumeExample();
// bestFiveExample();
