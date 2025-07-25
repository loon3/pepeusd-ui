// src/App.js
import { useEffect, useState, useCallback } from 'react';
import { BrowserProvider, Contract, formatUnits, parseUnits } from 'ethers';
import PepeABI from './abis/PepeUSD.json'
import USDCABI from './abis/USDC.json'
import Spinner from './Spinner';

const PEPEUSD_ADDRESS = "0xed7fd16423Bc19b9143313ac5E4B7F731D714e97";
const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

function Modal({ isOpen, onClose }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex justify-center items-center">
      <div className="bg-white p-8 rounded shadow-lg max-w-lg text-center">
        <h2 className="text-xl font-bold mb-4">What is PepeUSD?</h2>
        <p className="mb-4">PepeUSD is a first of its kind collectible crypto coin with <strong><em>Stable Floor Technology</em></strong>.</p>
        <p className="mb-4">PepeUSD can be minted and redeemed 1:1 with USDC but is limited to a <span className="font-bold">max supply of 420,000</span>.</p>
        <p className="mb-4">The floor price is set at 1 USDC and can never go below it.</p>
        <p className="mb-4">The PepeUSD contract source code is verified and <a href={`https://etherscan.io/address/${PEPEUSD_ADDRESS}#code#F1#L1`} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">viewable on Etherscan</a>. The contract has no admin functions or golden keys and is fully decentralized.</p>
        <button onClick={onClose} className="mt-4 bg-blue-500 text-white px-4 py-2 rounded">Close</button>
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
  const [status, setStatus] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [walletStatus, setWalletStatus] = useState('');

  const connectWallet = async () => {
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

      const pepeContract = new Contract(PEPEUSD_ADDRESS, PepeABI.abi, signer);
      const usdcContract = new Contract(USDC_ADDRESS, USDCABI.abi, signer);
      setPepe(pepeContract);
      setUsdc(usdcContract);
    } catch (error) {
      setWalletStatus('Error connecting wallet');
      setStatus(`Error connecting wallet: ${error.message}`);
    }
  };

  const fetchEthBalanceFromAPI = async (address) => {
    try {
      const response = await fetch(`https://api.etherscan.io/v2/api?chainid=1&module=account&action=balance&address=${address}&tag=latest&apikey=${process.env.ETHERSCAN_API_KEY}`);
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
      const response = await fetch(`https://api.etherscan.io/v2/api?chainid=1&module=stats&action=tokensupply&contractaddress=${PEPEUSD_ADDRESS}&apikey=${process.env.ETHERSCAN_API_KEY}`);
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

  useEffect(() => {
    fetchTotalSupplyFromAPI().then(setTotalSupply);
  }, []);

  useEffect(() => {
    if (walletAddress) fetchBalances();
  }, [walletAddress, pepe, usdc, fetchBalances]);

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
        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      </div>
      <div className={`absolute top-4 sm:right-4 z-10 ${isModalOpen ? 'blur-sm' : ''}`}>
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
        <span className="inline-block bg-blue-100 text-blue-800 text-xs font-semibold mb-4 px-2.5 py-0.5 rounded-full">Ethereum Mainnet</span>
    
        <div className="flex justify-center items-center my-4">
          <img src="PEPEUSD.png" alt="PepeUSD" className="w-64 h-64" />
        </div>
         <p className="text-center text-xl text-gray-600 mb-0">Mint and Redeem</p>
         <p className="text-center text-xl font-bold text-gray-600 mb-1">PepeUSD:USD (1:1)</p>
         <p className="text-center text-xs text-gray-600 mb-4">Limited to 420,000 PepeUSD</p>
         <p className="text-center text-xs text-gray-600 mb-8 font-bold">CA: {PEPEUSD_ADDRESS}</p>
         <p className="text-md text-gray-800 mb-1 text-center">PepeUSD Supply <span className="">({(totalSupply / 420000 * 100).toFixed(2)}&#37; minted)</span>:</p>
         <p className="text-2xl text-gray-800 mb-4 text-center"><span className="font-bold">{Number(totalSupply).toFixed(2)}</span> </p>   
        
        
        {!walletAddress ? (
          <></>
        ) : (
          <>
            
            <div className="relative">
              {status && (
                <div className="absolute z-20 flex flex-col justify-center items-center h-full w-full bg-gray-800 bg-opacity-80 text-white rounded-lg">
                  <p>{status}</p>
                  {isProcessing ? (<Spinner />) : (<div className="text-white underline cursor-pointer mt-4" onClick={() => setStatus('')}>Click to continue...</div>)}
                </div>
              )}
              <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 bg-gray-50 p-4 rounded-lg w-full h-full ${status ? 'blur-sm' : ''}`}>
               
                <div className="bg-gray-50 pb-4 px-4 rounded-lg">
                  <h3 className="text-4xl font-semibold">Mint</h3>
                  <a href={`https://etherscan.io/address/${PEPEUSD_ADDRESS}`} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-600 underline">View PepeUSD Contract</a>
                  <p className="text-sm text-gray-600 my-2">Balance: {balanceUsdc} USDC</p>
                  <div className="flex items-center mb-2">
                    <input
                      type="text"
                      placeholder="USDC Amount"
                      value={mintAmount}
                      onChange={(e) => setMintAmount(e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-l text-center"
                      disabled={isProcessing}
                    />
                    <span className="p-2 border border-gray-300 border-l-0 rounded-r text-gray-500 bg-gray-100">USDC</span>
                  </div>
                  <button onClick={mint} className="w-full bg-blue-500 text-white p-2 rounded" disabled={isProcessing}>Mint PepeUSD</button>
                </div>
                <div className="bg-gray-50 pb-4 px-4 rounded-lg">
                  <h3 className="text-4xl font-semibold">Redeem</h3>
                  <a href={`https://etherscan.io/address/${USDC_ADDRESS}`} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-600 underline">View USDC Contract</a>
                  <p className="text-sm text-gray-600 my-2">Balance: {balancePepe} PepeUSD</p>
                  <div className="flex items-center mb-2">
                  <input
                    type="text"
                    placeholder="PepeUSD Amount"
                    value={redeemAmount}
                    onChange={(e) => setRedeemAmount(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-l text-center"
                    disabled={isProcessing}
                  />
                  <span className="p-2 border border-gray-300 border-l-0 rounded-r text-gray-500 bg-gray-100">PepeUSD</span>
                  </div>
                  <button onClick={redeem} className="w-full bg-green-500 text-white p-2 rounded" disabled={isProcessing}>Redeem USDC</button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      <div className="text-center text-red-500 mt-4">{walletStatus}</div>
    </div>
  );
}

export default App;