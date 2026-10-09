/**
 * One-shot: create + extend a mainnet Address Lookup Table for CREW atomic v0.
 * Env: CREW_OPS_KEY (base58), RPC_URL
 * Prints: ALT=<pubkey>
 */
import bs58 from 'bs58'
import {
  AddressLookupTableProgram,
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
} from '@solana/web3.js'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pump = require('@pump-fun/pump-sdk')

function parseKey(raw) {
  const secret = raw.trim()
  try {
    return Keypair.fromSecretKey(bs58.decode(secret))
  } catch {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret)))
  }
}

const payer = parseKey(process.env.CREW_OPS_KEY || '')
const rpc = process.env.RPC_URL?.trim() || 'https://api.mainnet-beta.solana.com'
const connection = new Connection(rpc, 'confirmed')

const BUYBACK = new PublicKey('DKqEbHvb7KHSdChzF54KTdj6io4dVZvbieFEMcS1C5cw')

const ADDRESSES = [
  pump.PUMP_PROGRAM_ID,
  pump.PUMP_FEE_PROGRAM_ID,
  pump.PUMP_AMM_PROGRAM_ID,
  pump.GLOBAL_PDA,
  pump.PUMP_FEE_CONFIG_PDA,
  pump.FEE_PROGRAM_GLOBAL_PDA,
  pump.PUMP_EVENT_AUTHORITY_PDA,
  pump.PUMP_FEE_EVENT_AUTHORITY_PDA,
  pump.PUMP_AMM_EVENT_AUTHORITY_PDA,
  pump.AMM_GLOBAL_PDA,
  SystemProgram.programId,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  ComputeBudgetProgram.programId,
  BUYBACK,
].map((a) => (a instanceof PublicKey ? a : new PublicKey(a)))

const bal = await connection.getBalance(payer.publicKey)
console.error(`authority=${payer.publicKey.toBase58()} sol=${(bal / 1e9).toFixed(4)}`)
if (bal < 5_000_000) throw new Error('Ops wallet needs ≥0.005 SOL for ALT create+extend')

const slot = await connection.getSlot('finalized')
const [createIx, lutAddress] = AddressLookupTableProgram.createLookupTable({
  authority: payer.publicKey,
  payer: payer.publicKey,
  recentSlot: slot - 1,
})

const createTx = new Transaction().add(
  ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
  createIx,
)
createTx.feePayer = payer.publicKey
const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
createTx.recentBlockhash = blockhash
createTx.sign(payer)
const createSig = await connection.sendRawTransaction(createTx.serialize(), {
  skipPreflight: false,
  preflightCommitment: 'confirmed',
})
await connection.confirmTransaction({ signature: createSig, blockhash, lastValidBlockHeight }, 'confirmed')
console.error(`created ALT=${lutAddress.toBase58()} sig=${createSig}`)

// Extend in chunks of ≤20 addresses (ALT extend limit per ix is 30, stay safe)
const chunkSize = 20
for (let i = 0; i < ADDRESSES.length; i += chunkSize) {
  const chunk = ADDRESSES.slice(i, i + chunkSize)
  const extendIx = AddressLookupTableProgram.extendLookupTable({
    payer: payer.publicKey,
    authority: payer.publicKey,
    lookupTable: lutAddress,
    addresses: chunk,
  })
  const tx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
    extendIx,
  )
  tx.feePayer = payer.publicKey
  const bh = await connection.getLatestBlockhash('confirmed')
  tx.recentBlockhash = bh.blockhash
  tx.sign(payer)
  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  })
  await connection.confirmTransaction(
    { signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight },
    'confirmed',
  )
  console.error(`extended +${chunk.length} sig=${sig}`)
}

// Wait until ALT is usable (active after next slot)
for (let attempt = 0; attempt < 20; attempt += 1) {
  await new Promise((r) => setTimeout(r, 800))
  const res = await connection.getAddressLookupTable(lutAddress)
  if (res.value && res.value.state.addresses.length >= ADDRESSES.length) {
    console.error(`active addresses=${res.value.state.addresses.length}`)
    console.log(`ALT=${lutAddress.toBase58()}`)
    process.exit(0)
  }
}
throw new Error('ALT created but not active yet — set CREW_LOOKUP_TABLE anyway after a minute')
