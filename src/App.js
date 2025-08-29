// src/App.js
import React, { useState, useEffect, useCallback } from 'react';
import { BrowserProvider, Contract, formatUnits, parseUnits } from 'ethers';
import PepeABI from './abis/PepeUSD.json'
import USDCABI from './abis/USDC.json'
import Spinner from './Spinner';

const PEPEUSD_ADDRESS = "0xed7fd16423Bc19b9143313ac5E4B7F731D714e97";
const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const UNISWAP_V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
const UNISWAP_POOL_FEE = 10000; // 1% fee tier

// Minimal ABI for Uniswap V3 Pool
const POOL_ABI = [
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function liquidity() external view returns (uint128)",
  "function feeGrowthGlobal0X128() external view returns (uint256)",
  "function feeGrowthGlobal1X128() external view returns (uint256)"
];

// Minimal ABI for Uniswap V3 Factory
const FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)"
];

// Uniswap V3 NonfungiblePositionManager ABI
const POSITION_MANAGER_ABI = [
  "function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
  "function increaseLiquidity((uint256 tokenId, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, uint256 deadline)) external payable returns (uint128 liquidity, uint256 amount0, uint256 amount1)",
  "function balanceOf(address owner) external view returns (uint256 balance)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256 tokenId)",
  "function positions(uint256 tokenId) external view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)"
];

const POSITION_MANAGER_ADDRESS = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";

function Modal({ isOpen, onClose }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex justify-center items-center z-50">
      <div className="bg-white p-8 rounded shadow-lg max-w-lg text-center">
        <h2 className="text-xl font-bold mb-4">What is PepeUSD?</h2>
        <p className="mb-4">PepeUSD is a first of its kind collectible token built with <strong><em>Stable Floor Technology</em></strong>.</p>
        <p className="mb-4">PepeUSD can be minted and redeemed 1:1 with USDC but is limited to a <span className="font-bold">max supply of 420,000</span>.</p>
        <p className="mb-4">1 PepeUSD will always be <span className="font-bold">worth at least 1 USDC</span>.</p>
        <p className="mb-4">The PepeUSD contract source code is verified and <a href={`https://etherscan.io/address/${PEPEUSD_ADDRESS}#code#F1#L1`} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">viewable on Etherscan</a>. The contract has no admin functions or golden keys and is fully decentralized.</p>
        <button onClick={onClose} className="mt-4 bg-blue-500 text-white px-4 py-2 rounded">I Agree To Use At My Own Risk</button>
      </div>
    </div>
  );
}

function App() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [walletAddress, setWalletAddress] = useState(null);
  const [pepe, setPepe] = useState(null);
  const [usdc, setUsdc] = useState(null);
  const [balancePepe, setBalancePepe] = useState('0');
  const [balanceUsdc, setBalanceUsdc] = useState('0');
  const [balanceEth, setBalanceEth] = useState('0');
  const [totalSupply, setTotalSupply] = useState('0');
  const [mintAmount, setMintAmount] = useState('');
  const [redeemAmount, setRedeemAmount] = useState('');
  const [stakeAmount, setStakeAmount] = useState('');
  const [status, setStatus] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [walletStatus, setWalletStatus] = useState('');
  const [stakeAPR, setStakeAPR] = useState('0');
  const [poolLiquidity, setPoolLiquidity] = useState('0');
  const [currentPrice, setCurrentPrice] = useState('0');
  const [priceLoading, setPriceLoading] = useState(false);
  const [userPositions, setUserPositions] = useState([]);
  const [positionsLoading, setPositionsLoading] = useState(false);

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      setWalletStatus('No web3 wallet detected. Please install a web3 wallet extension like MetaMask.');
      return;
    }
    try {
      const provider = new BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();
      console.log(Number(network.chainId));
      
      if (Number(network.chainId) !== 1) {
        setWalletStatus('Please switch your wallet to the Ethereum network.');
        return;
      }

      const signer = await provider.getSigner();
      setWalletStatus('');
      setWalletAddress(await signer.getAddress());
      sessionConnected();

      const pepeContract = new Contract(PEPEUSD_ADDRESS, PepeABI.abi, signer);
      const usdcContract = new Contract(USDC_ADDRESS, USDCABI.abi, signer);
      setPepe(pepeContract);
      setUsdc(usdcContract);
    } catch (error) {
      setWalletStatus('Error connecting wallet');
      setStatus(`Error connecting wallet: ${error.message}`);
    }
  }, []);

  const fetchEthBalanceFromAPI = async (address) => {
    try {
      const response = await fetch(`https://api.etherscan.io/v2/api?chainid=1&module=account&action=balance&address=${address}&tag=latest&apikey=${process.env.REACT_APP_ETHERSCAN_API_KEY}`);
      const data = await response.json();
      if (data.status === "1") {
        return formatUnits(data.result, 18).slice(0, -14);
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      console.error("Error fetching ETH balance from API:", error);
      return "0";
    }
  };

  const fetchTotalSupplyFromAPI = async () => {
    try {
      const response = await fetch(`https://api.etherscan.io/v2/api?chainid=1&module=stats&action=tokensupply&contractaddress=${PEPEUSD_ADDRESS}&apikey=${process.env.REACT_APP_ETHERSCAN_API_KEY}`);
      const data = await response.json();
      if (data.status === "1") {
        return formatUnits(data.result, 6);
      } else {
        throw new Error(data.message);
      }
    } catch (error) {
      console.error("Error fetching total supply from API:", error);
      return "0";
    }
  };

  const fetchBalances = useCallback(async () => {
    if (!walletAddress || !pepe || !usdc) return;
    try {
      const [pBal, uBal, supply] = await Promise.all([
        pepe.balanceOf(walletAddress),
        usdc.balanceOf(walletAddress),
        pepe.totalSupply()
      ]);
      setBalancePepe(formatUnits(pBal, 6));
      setBalanceUsdc(formatUnits(uBal, 6));
      setTotalSupply(formatUnits(supply, 6));

      // Fetch ETH balance separately to avoid hanging up other balance fetches
      const eBal = await fetchEthBalanceFromAPI(walletAddress);
      setBalanceEth(eBal);
    } catch (error) {
      setStatus(`Error fetching balances: ${error.message}`);
    }
  }, [walletAddress, pepe, usdc]);

  const checkIfValidAmount = (amount, coin) => {
    let balance = 0;
    console.log("balanceUsdc", balanceUsdc);
    console.log("balancePepe", balancePepe);
    console.log("amount", amount);
    if(coin === 'usdc') {
      balance = balanceUsdc;
    } else if(coin === 'pepe') {
      balance = balancePepe;
    }
    if (amount === '') {
      console.error('Amount is empty');
      return false;
    }
    if (isNaN(amount)) {
      console.error('Amount is not a number');
      return false;
    }
    if (amount <= 0) {
      console.error('Amount is not greater than zero');
      return false;
    }
    if (!/^\d+(\.\d{1,6})?$/.test(amount)) {
      console.error('Amount has more than 6 decimal places');
      return false;
    }
    if (Number(amount) > Number(balance)) {
      console.error('Amount exceeds balance');
      return false;
    }
    return true;
  };

  const mint = async () => {
    try {
      if (!checkIfValidAmount(mintAmount, 'usdc')) {
        setStatus('Invalid amount');
        return;
      }
      setIsProcessing(true);
      setStatus('Confirm your spend limit...');
      const amt = parseUnits(mintAmount, 6);
      const tx1 = await usdc.approve(PEPEUSD_ADDRESS, amt);
      setStatus('Processing spend limit approval...');
      await tx1.wait();
      setStatus('Approve Minting...');
      const tx2 = await pepe.mint(amt);
      setStatus('Processing minting...');
      await tx2.wait();
      setStatus('✅ Mint successful!');
      await fetchBalances();
    } catch (error) {
      const errorMessage = error.reason || error.message.split('(')[0].trim();
      setStatus(`Mint failed: ${errorMessage}`);
    } finally {
      setIsProcessing(false);
      setMintAmount('');
    }
  };

  const redeem = async () => {
    try {
      if (!checkIfValidAmount(redeemAmount, 'pepe')) {
        setStatus('Invalid amount');
        return;
      }
      setIsProcessing(true);
      setStatus('Confirm your redeem...');
      const amt = parseUnits(redeemAmount, 6);
      const tx = await pepe.redeem(amt);
      setStatus('Processing redeem...');
      await tx.wait();
      setStatus('✅ Redeem successful!');
      await fetchBalances();
    } catch (error) {
      const errorMessage = error.reason || error.message.split('(')[0].trim();
      setStatus(`Redeem failed: ${errorMessage}`);
    } finally {
      setIsProcessing(false);
      setRedeemAmount('');
    }
  };

  const fetchCurrentPrice = async () => {
    try {
      setPriceLoading(true);
      if (!window.ethereum) return;

      const provider = new BrowserProvider(window.ethereum);
      
      // Get factory contract
      const factoryContract = new Contract(UNISWAP_V3_FACTORY, FACTORY_ABI, provider);
      
      // Try different fee tiers to find the pool
      const feeTiers = [10000, 3000, 500]; // 1%, 0.3%, 0.05% (prioritize 1%)
      let poolAddress = null;
      let poolContract = null;
      
      for (const fee of feeTiers) {
        try {
          const addr = await factoryContract.getPool(PEPEUSD_ADDRESS, USDC_ADDRESS, fee);
          if (addr !== '0x0000000000000000000000000000000000000000') {
            poolAddress = addr;
            break;
          }
        } catch (e) {
          console.log(`Fee tier ${fee} failed:`, e);
        }
      }
      
      if (!poolAddress) {
        console.log('No pool found for any fee tier');
        // Fallback to assume 1:1 price for now
        setCurrentPrice('1.0000');
        return 1.0;
      }

      // Get pool contract
      poolContract = new Contract(poolAddress, POOL_ABI, provider);
      
      // Get current price from slot0
      const slot0 = await poolContract.slot0();
      const sqrtPriceX96 = slot0.sqrtPriceX96;
      
      console.log('sqrtPriceX96:', sqrtPriceX96.toString());
      
      // Calculate price from sqrtPriceX96
      // Price = (sqrtPriceX96 / 2^96)^2
      const Q96 = Math.pow(2, 96);
      const sqrtPrice = Number(sqrtPriceX96) / Q96;
      const price = sqrtPrice * sqrtPrice;
      
      console.log('Calculated price:', price);
      
      // For PepeUSD/USDC, we need to check token order
      // If token0 is USDC and token1 is PepeUSD, price is correct
      // If token0 is PepeUSD and token1 is USDC, we need to invert
      const token0IsUsdc = USDC_ADDRESS.toLowerCase() < PEPEUSD_ADDRESS.toLowerCase();
      const finalPrice = token0IsUsdc ? 1 / price : price;
      
      console.log('Final price (1 PepeUSD = X USDC):', finalPrice);
      
      // Get pool liquidity for APR calculation
      try {
        const liquidity = await poolContract.liquidity();
        setPoolLiquidity(liquidity.toString());
        
        // Calculate estimated APR based on pool liquidity and fee tier
        const estimatedAPR = calculateAPR(liquidity.toString(), finalPrice);
        setStakeAPR(estimatedAPR.toFixed(2));
      } catch (error) {
        console.log('Error fetching liquidity:', error);
        setPoolLiquidity('0');
        setStakeAPR('0');
      }
      
      setCurrentPrice(finalPrice.toFixed(4));
      return finalPrice;
    } catch (error) {
      console.error('Error fetching price:', error);
      // Fallback to 1:1 if price fetch fails
      setCurrentPrice('1.0000');
      return 1.0;
    } finally {
      setPriceLoading(false);
    }
  };

  const calculateAPR = (liquidityAmount, currentPrice) => {
    try {
      // Convert liquidity to a usable number (simplified calculation)
      const liquidity = Number(liquidityAmount) / Math.pow(10, 18); // Approximate conversion
      
      if (liquidity === 0) return 0;
      
      // Estimate daily volume based on liquidity (this is a rough approximation)
      // In practice, you'd want to fetch actual volume data from The Graph or similar
      const estimatedDailyVolume = liquidity * 0.1; // Assume 10% of liquidity trades daily
      
      // Calculate daily fees (1% fee tier)
      const dailyFees = estimatedDailyVolume * 0.01;
      
      // Calculate APR: (daily fees / liquidity) * 365 * 100
      const apr = (dailyFees / liquidity) * 365 * 100;
      
      // Cap at reasonable values (0-1000%)
      return Math.min(Math.max(apr, 0), 1000);
    } catch (error) {
      console.error('Error calculating APR:', error);
      return 0;
    }
  };

  const checkPepeUSDPrice = async () => {
    try {
      const price = await fetchCurrentPrice();
      return price <= 1.0 && price > 0;
    } catch (error) {
      console.error('Error checking PepeUSD price:', error);
      return false;
    }
  };

  // Helper function to calculate tick from price
  const priceToTick = (price) => {
    return Math.floor(Math.log(price) / Math.log(1.0001));
  };

  // Helper function to get nearest valid tick (Uniswap V3 uses tick spacing)
  const getNearestValidTick = (tick, tickSpacing = 200) => { // 1% fee tier uses 200 tick spacing
    return Math.round(tick / tickSpacing) * tickSpacing;
  };

  // Debug function to check all user positions with tick info
  const debugAllPositions = async () => {
    if (!walletAddress) return;
    
    try {
      const provider = new BrowserProvider(window.ethereum);
      const positionManager = new Contract(POSITION_MANAGER_ADDRESS, POSITION_MANAGER_ABI, provider);

      const balance = await positionManager.balanceOf(walletAddress);
      console.log('=== ALL USER POSITIONS ===');
      
      for (let i = 0; i < Number(balance); i++) {
        try {
          const tokenId = await positionManager.tokenOfOwnerByIndex(walletAddress, i);
          const position = await positionManager.positions(tokenId);
          
          const [nonce, operator, token0, token1, fee, tickLower, tickUpper, liquidity] = position;
          
          // Check if this is PepeUSD/USDC pair
          const isPepeUsdcPair = 
            ((token0.toLowerCase() === PEPEUSD_ADDRESS.toLowerCase() && token1.toLowerCase() === USDC_ADDRESS.toLowerCase()) ||
             (token0.toLowerCase() === USDC_ADDRESS.toLowerCase() && token1.toLowerCase() === PEPEUSD_ADDRESS.toLowerCase()));

          if (isPepeUsdcPair) {
            // Calculate price range from ticks
            const lowerPrice = Math.pow(1.0001, Number(tickLower));
            const upperPrice = Math.pow(1.0001, Number(tickUpper));
            
            console.log(`Position #${tokenId}:`);
            console.log(`  Fee Tier: ${Number(fee)/10000}%`);
            console.log(`  Tick Lower: ${tickLower} (Price: ${lowerPrice.toFixed(4)})`);
            console.log(`  Tick Upper: ${tickUpper} (Price: ${upperPrice.toFixed(4)})`);
            console.log(`  Token0: ${token0 === USDC_ADDRESS ? 'USDC' : 'PepeUSD'}`);
            console.log(`  Token1: ${token1 === USDC_ADDRESS ? 'USDC' : 'PepeUSD'}`);
            console.log(`  Liquidity: ${liquidity.toString()}`);
            console.log('---');
          }
        } catch (error) {
          console.log(`Error checking position ${i}:`, error);
        }
      }
    } catch (error) {
      console.error('Error in debugAllPositions:', error);
    }
  };

  // Make debug function available globally for console access
  if (typeof window !== 'undefined') {
    window.debugAllPositions = debugAllPositions;
  }

  const fetchUserPositions = async () => {
    if (!walletAddress) return;
    
    try {
      setPositionsLoading(true);
      const provider = new BrowserProvider(window.ethereum);
      const positionManager = new Contract(POSITION_MANAGER_ADDRESS, POSITION_MANAGER_ABI, provider);

      // Get number of positions owned by user
      const balance = await positionManager.balanceOf(walletAddress);
      const positions = [];

      // Calculate expected tick range for our specific strategy (1.00 to infinite)
      const token0IsUsdc = USDC_ADDRESS.toLowerCase() < PEPEUSD_ADDRESS.toLowerCase();
      let expectedTickLower, expectedTickUpper;
      
      if (token0IsUsdc) {
        expectedTickLower = -23000; // Tick for price 0.1 (matches your position)
        expectedTickUpper = 0; // Tick for price 1.0 (matches your position)
      } else {
        expectedTickLower = 0; // Tick for price 1.0
        expectedTickUpper = 23000; // Tick for price 10.0 (inverted)
      }

      // Check each position
      for (let i = 0; i < Number(balance); i++) {
        try {
          const tokenId = await positionManager.tokenOfOwnerByIndex(walletAddress, i);
          const position = await positionManager.positions(tokenId);
          
          const [nonce, operator, token0, token1, fee, tickLower, tickUpper, liquidity, feeGrowthInside0LastX128, feeGrowthInside1LastX128, tokensOwed0, tokensOwed1] = position;
          
          // Check if this is our specific PepeUSD/USDC position with exact parameters
          const isOurSpecificPosition = 
            ((token0.toLowerCase() === PEPEUSD_ADDRESS.toLowerCase() && token1.toLowerCase() === USDC_ADDRESS.toLowerCase()) ||
             (token0.toLowerCase() === USDC_ADDRESS.toLowerCase() && token1.toLowerCase() === PEPEUSD_ADDRESS.toLowerCase())) &&
            Number(fee) === UNISWAP_POOL_FEE &&
            Number(tickLower) === expectedTickLower &&
            Number(tickUpper) === expectedTickUpper &&
            Number(liquidity) > 0;

          if (isOurSpecificPosition) {
            // Calculate current position value (simplified - would need more complex math for exact values)
            const token0IsPepe = token0.toLowerCase() === PEPEUSD_ADDRESS.toLowerCase();
            
            positions.push({
              tokenId: tokenId.toString(),
              token0,
              token1,
              fee: Number(fee),
              tickLower: Number(tickLower),
              tickUpper: Number(tickUpper),
              liquidity: liquidity.toString(),
              tokensOwed0: formatUnits(tokensOwed0, 6), // Fees earned
              tokensOwed1: formatUnits(tokensOwed1, 6),
              token0IsPepe,
              // Simplified position amounts (in practice, you'd calculate based on current price and liquidity)
              pepeAmount: token0IsPepe ? '~' + formatUnits(liquidity.toString().slice(0, 10) || '0', 6) : '0',
              usdcAmount: !token0IsPepe ? '~' + formatUnits(liquidity.toString().slice(0, 10) || '0', 6) : '0'
            });
          }
        } catch (error) {
          console.log('Error checking position', i, ':', error);
          continue;
        }
      }

      setUserPositions(positions);
    } catch (error) {
      console.error('Error fetching user positions:', error);
      setUserPositions([]);
    } finally {
      setPositionsLoading(false);
    }
  };

  const findExistingPosition = async (targetToken0, targetToken1, targetFee, targetTickLower, targetTickUpper) => {
    try {
      const provider = new BrowserProvider(window.ethereum);
      const positionManager = new Contract(POSITION_MANAGER_ADDRESS, POSITION_MANAGER_ABI, provider);

      // Get number of positions owned by user
      const balance = await positionManager.balanceOf(walletAddress);
      console.log('User has', balance.toString(), 'NFT positions');

      // Check each position to see if it matches our parameters
      for (let i = 0; i < Number(balance); i++) {
        try {
          const tokenId = await positionManager.tokenOfOwnerByIndex(walletAddress, i);
          const position = await positionManager.positions(tokenId);
          
          const [nonce, operator, token0, token1, fee, tickLower, tickUpper, liquidity] = position;
          
          // Check if this position matches our target parameters
          if (
            token0.toLowerCase() === targetToken0.toLowerCase() &&
            token1.toLowerCase() === targetToken1.toLowerCase() &&
            Number(fee) === targetFee &&
            Number(tickLower) === targetTickLower &&
            Number(tickUpper) === targetTickUpper &&
            Number(liquidity) > 0 // Position has active liquidity
          ) {
            console.log('Found matching position:', tokenId.toString());
            return tokenId;
          }
        } catch (error) {
          console.log('Error checking position', i, ':', error);
          continue;
        }
      }
      
      return null; // No matching position found
    } catch (error) {
      console.error('Error finding existing positions:', error);
      return null;
    }
  };

  const createOrIncreasePosition = async (pepeAmount) => {
    try {
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const positionManager = new Contract(POSITION_MANAGER_ADDRESS, POSITION_MANAGER_ABI, signer);

      // Determine token order (Uniswap orders by address)
      const token0IsUsdc = USDC_ADDRESS.toLowerCase() < PEPEUSD_ADDRESS.toLowerCase();
      const token0 = token0IsUsdc ? USDC_ADDRESS : PEPEUSD_ADDRESS;
      const token1 = token0IsUsdc ? PEPEUSD_ADDRESS : USDC_ADDRESS;

      // Calculate ticks for price range
      let tickLower, tickUpper;
      if (token0IsUsdc) {
        // Match your existing position: 0.1 to 1.0 USDC per PepeUSD
        tickLower = -23000; // Tick for price 0.1 (matches your position)
        tickUpper = 0; // Tick for price 1.0 (matches your position)
      } else {
        // For PepeUSD/USDC token order: invert the range
        tickLower = 0; // Tick for price 1.0
        tickUpper = 23000; // Tick for price 10.0
      }

      // Check for existing position with same parameters
      const existingTokenId = await findExistingPosition(token0, token1, UNISWAP_POOL_FEE, tickLower, tickUpper);

      if (existingTokenId) {
        // Increase liquidity on existing position
        console.log('Adding to existing position:', existingTokenId.toString());
        
        const amount0Desired = token0IsUsdc ? 0 : pepeAmount;
        const amount1Desired = token0IsUsdc ? pepeAmount : 0;

        const increaseLiquidityParams = {
          tokenId: existingTokenId,
          amount0Desired: amount0Desired,
          amount1Desired: amount1Desired,
          amount0Min: 0,
          amount1Min: 0,
          deadline: Math.floor(Date.now() / 1000) + 1800
        };

        const tx = await positionManager.increaseLiquidity(increaseLiquidityParams);
        return { tx, tokenId: existingTokenId, isNew: false };
      } else {
        // Create new position
        console.log('Creating new position');
        
        // Since current price (~0.99) is below our range (1.00+), we only need PepeUSD
        // This matches how Uniswap works - only the token for the active side of the range
        
        let amount0Desired, amount1Desired;
        if (token0IsUsdc) {
          // token0 = USDC, token1 = PepeUSD
          amount0Desired = 0; // No USDC needed when price is below range
          amount1Desired = pepeAmount; // Full PepeUSD amount
        } else {
          // token0 = PepeUSD, token1 = USDC  
          amount0Desired = pepeAmount; // Full PepeUSD amount
          amount1Desired = 0; // No USDC needed when price is below range
        }

        const mintParams = {
          token0: token0,
          token1: token1,
          fee: UNISWAP_POOL_FEE,
          tickLower: tickLower,
          tickUpper: tickUpper,
          amount0Desired: amount0Desired,
          amount1Desired: amount1Desired,
          amount0Min: 0,
          amount1Min: 0,
          recipient: walletAddress,
          deadline: Math.floor(Date.now() / 1000) + 1800
        };

        console.log('Mint params:', mintParams);
        console.log('Token order - token0IsUsdc:', token0IsUsdc);
        console.log('Calculated ticks - Lower:', tickLower, 'Upper:', tickUpper);

        const tx = await positionManager.mint(mintParams);
        return { tx, tokenId: null, isNew: true }; // tokenId will be in transaction receipt
      }
    } catch (error) {
      throw error;
    }
  };

  const stake = async () => {
    try {
      if (!checkIfValidAmount(stakeAmount, 'pepe')) {
        setStatus('Invalid amount');
        return;
      }
      
      setIsProcessing(true);
      setStatus('Checking market conditions...');
      
      // Check if PepeUSD price ≤ 1 USDC
      const priceConditionMet = await checkPepeUSDPrice();
      if (!priceConditionMet) {
        setStatus('❌ Staking unavailable: PepeUSD price exceeds 1 USDC');
        setTimeout(() => setStatus(''), 4000);
        return;
      }
      
      setStatus('Price condition met. Preparing single-sided liquidity provision...');
      
      // Convert stakeAmount for single-sided liquidity provision
      const pepeAmount = parseUnits(stakeAmount, 6);
      
      // Step 1: Approve PepeUSD for Uniswap Position Manager
      setStatus('Approve PepeUSD spending...');
      const pepeApprovalTx = await pepe.approve(
        POSITION_MANAGER_ADDRESS,
        pepeAmount
      );
      await pepeApprovalTx.wait();
      
      // Step 2: Check for existing position or create new one
      setStatus('Checking for existing positions...');
      
      // Debug: Log parameters before creating position
      console.log('Creating position with amount:', stakeAmount);
      console.log('Parsed amount:', pepeAmount.toString());
      console.log('Current price condition met:', Number(currentPrice) <= 1.0);
      console.log('Pool exists:', Number(currentPrice) > 0);
      
      // Check if pool exists, if not the transaction will fail
      if (Number(currentPrice) === 0) {
        setStatus('❌ Pool does not exist yet. Cannot create position.');
        setTimeout(() => setStatus(''), 4000);
        return;
      }
      
      const result = await createOrIncreasePosition(pepeAmount);
      const { tx, tokenId, isNew } = result;
      
      if (isNew) {
        setStatus('Creating new Uniswap V3 liquidity position...');
      } else {
        setStatus('Adding liquidity to existing position...');
      }
      
      const receipt = await tx.wait();
      console.log('Transaction receipt:', receipt);
      
      // Extract tokenId for new positions from transaction receipt
      let finalTokenId = tokenId;
      if (isNew && receipt.logs) {
        // Look for Transfer event from NonfungiblePositionManager (NFT mint)
        const transferLog = receipt.logs.find(log => 
          log.address.toLowerCase() === POSITION_MANAGER_ADDRESS.toLowerCase() &&
          log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' // Transfer event signature
        );
        if (transferLog) {
          finalTokenId = parseInt(transferLog.topics[3], 16).toString();
        }
      }
      
      const actionText = isNew ? 'created' : 'increased';
      let statusMessage = `✅ Liquidity position ${actionText} successfully!`;
      
      if (finalTokenId) {
        const uniswapLink = `https://app.uniswap.org/positions/v3/ethereum/${finalTokenId}`;
        statusMessage += ` <a href="${uniswapLink}" target="_blank" rel="noopener noreferrer" style="color: #3B82F6; text-decoration: underline;">View on Uniswap</a>`;
        console.log('Position NFT ID:', finalTokenId);
        console.log('Uniswap link:', uniswapLink);
      }
      
      setStatus(statusMessage);
      
      // Refresh balances and positions
      await fetchBalances();
      await fetchUserPositions();
      
      setTimeout(() => setStatus(''), 5000);
      
    } catch (error) {
      console.error('Full error object:', error);
      
      let errorMessage = 'Unknown error';
      
      // Try to extract more meaningful error messages
      if (error.reason) {
        errorMessage = error.reason;
      } else if (error.message) {
        if (error.message.includes('insufficient funds')) {
          errorMessage = 'Insufficient funds for gas or token amount';
        } else if (error.message.includes('user rejected')) {
          errorMessage = 'Transaction rejected by user';
        } else if (error.message.includes('require(false)')) {
          errorMessage = 'Transaction failed - check pool exists and parameters are correct';
        } else if (error.data && error.data.message) {
          errorMessage = error.data.message;
        } else {
          errorMessage = error.message.split('(')[0].trim();
        }
      }
      
      setStatus(`Stake failed: ${errorMessage}`);
    } finally {
      setIsProcessing(false);
      setStakeAmount('');
    }
  };

  const sessionConnected = () => {
    sessionStorage.setItem('isConnected', 'true');
  }

  const termsAgreed = () => {
    sessionStorage.setItem('termsAgreed', 'true');
  }

  useEffect(() => {
    console.log('useEffect, connectWallet');
    fetchTotalSupplyFromAPI().then(setTotalSupply);
    const checkIfConnected = sessionStorage.getItem('isConnected');
    if (checkIfConnected === 'true') {
      connectWallet();
    }
    const checkIfTermsAgreed = sessionStorage.getItem('termsAgreed');
    if (checkIfTermsAgreed !== 'true') {
      setIsModalOpen(true);
    }
  }, [connectWallet]);

  useEffect(() => {
    if (walletAddress) {
      fetchBalances();
      fetchCurrentPrice(); // Fetch price when wallet connects
      fetchUserPositions(); // Fetch positions when wallet connects
    }
  }, [walletAddress, pepe, usdc, fetchBalances]);

  useEffect(() => {
    // Fetch price every 30 seconds if wallet is connected
    if (walletAddress) {
      const interval = setInterval(fetchCurrentPrice, 30000);
      return () => clearInterval(interval);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (isModalOpen) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
  }, [isModalOpen]);

  return (
    <div className={`flex flex-col justify-center items-center min-h-screen bg-gray-100 py-32 relative ${isModalOpen ? 'pointer-events-none' : ''}`}>
      {/* Trigger for the modal */}
      <button onClick={() => setIsModalOpen(true)} className="text-blue-500 underline mb-4 pointer-events-auto">What is PepeUSD?</button>
      <div className="pointer-events-auto">
        <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); termsAgreed(); }} />
      </div>
      <div className={`absolute top-4 sm:right-4 z-10`}>
        {!walletAddress ? (
          <button onClick={connectWallet} className="bg-blue-500 text-white text-lg font-semibold px-4 py-2 rounded-lg cursor-pointer">Connect Wallet</button>
        ) : (
          <div className="flex space-x-0 border border-black rounded-full">
            <div className="bg-gray-800 text-white text-xs font-semibold px-2.5 py-0.5 rounded-l-full">
              <a href={`https://etherscan.io/address/${walletAddress}`} target="_blank" rel="noopener noreferrer" className="text-sm text-white font-bold text-center break-all cursor-pointer">
                {walletAddress.slice(0, 7)}...{walletAddress.slice(-5)}
              </a>
            </div>
            <div className="bg-white text-gray-800 text-xs font-semibold px-2.5 py-0.5 rounded-r-full">
              <p className="text-sm text-gray-800 text-center">
                {balanceEth} ETH
              </p>
            </div>
          </div>
        )}
      </div>
      <div className={`pt-4 pl-4 pr-4 pb-4 bg-white rounded-lg shadow-md text-center`}>

    
        {/* Enhanced hero section */}
        <div className="relative overflow-hidden p-6 mb-6">
          
          {/* Content */}
          <div className="relative flex flex-col lg:flex-row items-center justify-between gap-6">
            {/* Left section: Logo and branding */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
              {/* Logo */}
              <img 
                src="PEPEUSD.png" 
                alt="PepeUSD" 
                className="w-32 h-32 mx-auto sm:mx-0"
              />
              
              {/* Branding info */}
              <div className="text-center sm:text-left">
                <h1 className="text-2xl lg:text-3xl font-bold text-gray-800 mb-1">
                  PepeUSD
                </h1>
                                <div className="flex flex-col items-center sm:items-start gap-2">
                  <span className="inline-flex items-center text-md text-gray-600 font-semibold">
                    Mint • Redeem • Stake
                  </span>
                  <a 
                    href={`https://etherscan.io/address/${PEPEUSD_ADDRESS}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-block bg-blue-100 hover:bg-blue-200 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded-full cursor-pointer transition-colors"
                  >
                    View Contract
                  </a>
                </div>
              </div>
            </div>

            {/* Right section: Supply metrics with cards */}
            <div className="flex flex-col sm:flex-row gap-4 lg:gap-6">
              {/* Current supply card */}
              <div className="bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-gray-300 shadow-lg min-w-[160px]">
                <div className="text-center">
                  <p className="text-xs font-medium text-gray-600 mb-1 uppercase tracking-wide">Current Supply</p>
                  <p className="text-2xl lg:text-3xl font-bold text-green-600">
                    {Number(totalSupply).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">PepeUSD</p>
                </div>
              </div>

              {/* Progress and stats card */}
              <div className="bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-gray-300 shadow-lg min-w-[160px]">
                <div className="text-center">
                  <p className="text-xs font-medium text-gray-600 mb-2 uppercase tracking-wide">Minted Progress</p>
                  
                  {/* Progress bar */}
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-5 mb-2 overflow-hidden">
                    <div 
                      className="h-2 bg-green-500 rounded-full transition-all duration-1000 ease-out"
                      style={{ width: `${Math.min((totalSupply / 420000) * 100, 100)}%` }}
                    ></div>
                  </div>
                  
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-green-600">
                      {(totalSupply / 420000 * 100).toFixed(1)}%
                    </span>
                    <span className="text-gray-500">
                      of 420K max
                    </span>
                  </div>
                </div>
              </div>

              {walletAddress && (
                <div className="bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-gray-300 shadow-lg min-w-[160px]">
                  <div className="text-center">
                    <p className="text-xs font-medium text-gray-600 mb-1 uppercase tracking-wide">Current Price</p>
                    {priceLoading ? (
                      <div className="text-lg font-bold text-gray-400">Loading...</div>
                    ) : (
                      <p className={`text-xl lg:text-2xl font-bold ${Number(currentPrice) <= 1.0 && Number(currentPrice) > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${currentPrice}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">per PepeUSD</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div> 
        
        
        <div className="relative">
          {status && (
            <div className="absolute z-20 flex flex-col justify-center items-center h-full w-full bg-gray-800 bg-opacity-80 text-white rounded-lg">
              <p dangerouslySetInnerHTML={{ __html: status }}></p>
              {isProcessing ? (<Spinner />) : (<div className="text-white underline cursor-pointer mt-4" onClick={() => setStatus('')}>Click to continue...</div>)}
            </div>
          )}
          <div className={`grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 bg-gray-50 p-4 rounded-lg w-full h-full ${status ? 'blur-sm' : ''}`}>
           
            <div className="bg-gray-50 pb-4 px-4 rounded-lg">
              <h3 className="text-4xl font-semibold">Mint</h3>
            <p className="text-xs text-gray-600 my-2">PepeUSD for USDC (1:1)</p>
              <p className="text-md text-gray-600 my-2">
                Balance: {walletAddress ? balanceUsdc : '0.00'} USDC
              </p>
              <div className="flex items-center mb-2">
                <input
                  type="text"
                  placeholder="USDC Amount"
                  value={mintAmount}
                  onChange={(e) => setMintAmount(e.target.value)}
                  className={`w-full p-2 border border-gray-300 rounded-l text-center ${!walletAddress ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  disabled={isProcessing || !walletAddress}
                />
                <span className="p-2 border border-gray-300 border-l-0 rounded-r text-gray-500 bg-gray-100">USDC</span>
              </div>
              <button 
                onClick={mint} 
                className={`w-full p-2 rounded ${walletAddress ? 'bg-blue-500 hover:bg-blue-600 text-white' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`} 
                disabled={isProcessing || !walletAddress}
              >
                {walletAddress ? 'Mint PepeUSD' : 'Connect Wallet to Mint'}
              </button>
            </div>
            
            <div className="bg-gray-50 pb-4 px-4 rounded-lg">
              <h3 className="text-4xl font-semibold">Redeem</h3>
              <p className="text-xs text-gray-600 my-2">USDC for PepeUSD (1:1)</p>
              <p className="text-md text-gray-600 my-2">
                Balance: {walletAddress ? balancePepe : '0.00'} PepeUSD
              </p>
              <div className="flex items-center mb-2">
              <input
                type="text"
                placeholder="PepeUSD Amount"
                value={redeemAmount}
                onChange={(e) => setRedeemAmount(e.target.value)}
                className={`w-full p-2 border border-gray-300 rounded-l text-center ${!walletAddress ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                disabled={isProcessing || !walletAddress}
              />
              <span className="p-2 border border-gray-300 border-l-0 rounded-r text-gray-500 bg-gray-100">PepeUSD</span>
              </div>
              <button 
                onClick={redeem} 
                className={`w-full p-2 rounded ${walletAddress ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`} 
                disabled={isProcessing || !walletAddress}
              >
                {walletAddress ? 'Redeem USDC' : 'Connect Wallet to Redeem'}
              </button>
            </div>
            
            <div className="bg-gray-50 pb-4 px-4 rounded-lg">
              <h3 className="text-4xl font-semibold">Stake</h3>
              <p className="text-xs text-gray-600 my-2">
                {Number(stakeAPR) > 0 ? `Earn ~${Number(stakeAPR).toFixed(2)}% APR` : 'Connect Wallet to View APR'}
              </p>
              
              {/* Staking Condition */}
              {walletAddress && Number(currentPrice) > 1.0 && Number(currentPrice) > 0 && (
                <div className="text-xs text-red-600 mb-2 p-2 bg-red-50 rounded border">
                  ⚠️ Staking unavailable: Price exceeds $1.00 USDC
                </div>
              )}
              
              <p className="text-md text-gray-600 my-2">
                Balance: {walletAddress ? balancePepe : '0.00'} PepeUSD
              </p>
              
              <div className="flex items-center mb-2">
              <input
                type="text"
                placeholder="PepeUSD Amount"
                value={stakeAmount}
                onChange={(e) => setStakeAmount(e.target.value)}
                className={`w-full p-2 border border-gray-300 rounded-l text-center ${!walletAddress ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                disabled={isProcessing || !walletAddress}
              />
              <span className="p-2 border border-gray-300 border-l-0 rounded-r text-gray-500 bg-gray-100">PepeUSD</span>
              </div>
              <button 
                onClick={stake} 
                className={`w-full p-2 rounded ${
                  walletAddress && Number(currentPrice) <= 1.0 && Number(currentPrice) > 0 
                    ? 'bg-purple-500 hover:bg-purple-600 text-white' 
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`} 
                disabled={isProcessing || !walletAddress || Number(currentPrice) > 1.0 || Number(currentPrice) === 0}
              >
                {!walletAddress 
                  ? 'Connect Wallet to Stake' 
                  : Number(currentPrice) > 1.0 && Number(currentPrice) > 0
                  ? 'Price Too High'
                  : Number(currentPrice) === 0
                  ? 'Price Unavailable'
                  : 'Provide Liquidity'
                }
              </button>
            </div>
          </div>
        </div>
        
        {/* User Positions Display */}
        {walletAddress && (
          <div className="mt-6 bg-gray-50 p-4 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-gray-800">Your Liquidity Positions</h3>
              <button 
                onClick={fetchUserPositions}
                disabled={positionsLoading}
                className="text-sm bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 disabled:opacity-50"
              >
                {positionsLoading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
            
            {positionsLoading ? (
              <div className="text-center py-4">
                <Spinner />
                <p className="text-gray-600 mt-2">Loading positions...</p>
              </div>
            ) : userPositions.length === 0 ? (
              <div className="text-center py-4 text-gray-600">
                <p>No liquidity positions found</p>
                <p className="text-sm mt-2">Create your first position using the Stake section above</p>
              </div>
            ) : (
              <div className="space-y-4">
                {userPositions.map((position, index) => (
                  <div key={position.tokenId} className="bg-white p-4 rounded-lg border border-gray-200">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3">
                      <div className="flex items-center gap-2 mb-2 sm:mb-0">
                        <h4 className="font-semibold text-gray-800">Position #{position.tokenId}</h4>
                        <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded-full">1% Fee</span>
                      </div>
                      <a 
                        href={`https://app.uniswap.org/positions/v3/ethereum/${position.tokenId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-800 underline"
                      >
                        View on Uniswap →
                      </a>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-4">
                      
                      
                      {/* Fees Earned */}
                      <div className="bg-green-50 p-3 rounded">
                        <p className="text-xs text-gray-600 mb-1">Fees Earned</p>
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-green-700">
                            {Number(position.token0IsPepe ? position.tokensOwed0 : position.tokensOwed1).toFixed(4)} PepeUSD
                          </p>
                          <p className="text-sm font-medium text-green-700">
                            {Number(position.token0IsPepe ? position.tokensOwed1 : position.tokensOwed0).toFixed(4)} USDC
                          </p>
                        </div>
                      </div>
               
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Uniswap button outside white background */}
      <div className="text-center mt-12 mb-4">
        <a href="https://app.uniswap.org/swap?outputCurrency=0xed7fd16423Bc19b9143313ac5E4B7F731D714e97&inputCurrency=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48&chain=ethereum" target="_blank" rel="noopener noreferrer" className="bg-[#FF37C7] text-white text-lg font-semibold px-4 py-2 rounded-lg cursor-pointer hover:bg-[#E02FB5] transition-colors">
          Buy & Sell on Uniswap
        </a>
      </div>
      
      <div className="text-center text-red-500 mt-4">{walletStatus}</div>
      <div className="text-center mt-4 flex justify-center mt-2">
        <a href="https://github.com/loon3/pepeusd-ui" target="_blank" rel="noopener noreferrer" className="mx-2">
          <img src="github.svg" alt="GitHub" className="w-12 h-12 inline" />
        </a>
        <a href="https://twitter.com/pepeusdbot" target="_blank" rel="noopener noreferrer" className="mx-2">
          <img src="twitter.svg" alt="Twitter" className="w-12 h-12 inline" />
        </a>
        <a href="https://t.me/stablepepeusd" target="_blank" rel="noopener noreferrer" className="mx-2">
          <img src="telegram.svg" alt="Telegram" className="w-12 h-12 inline" />
        </a>
      </div>
    </div>
  );
}

export default App;