'use client';
/**
 * Google sends the player back here with an id_token in the URL hash (implicit flow). We hand it to the
 * server (which checks it and returns the stable salt), fetch the zkLogin proof, keep the short lived
 * key and proof in this browser, and continue to the game.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { getExtendedEphemeralPublicKey } from '@mysten/sui/zklogin';
import { toBase64 } from '@mysten/sui/utils';
import { api } from '@/lib/api';
import { takePending, saveZk, zkWallet, type ZkProof } from '@/lib/wallet';
import { useSession } from '@/components/app/Providers';
import { Button, Logo, Spinner } from '@/components/ui';

export default function GoogleReturn() {
  const router = useRouter();
  const { adoptWallet } = useSession();
  const [step, setStep] = useState('Checking your Google sign in');
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      const hash = new URLSearchParams(location.hash.slice(1));
      const idToken = hash.get('id_token');
      history.replaceState(null, '', '/auth/google'); // the token never stays in the address bar
      const pending = takePending();
      if (hash.get('error')) throw new Error('Google sign in was cancelled. Nothing changed.');
      if (!idToken || !pending) throw new Error('This sign in link is incomplete or was already used. Please start again.');
      const kp = Ed25519Keypair.fromSecretKey(pending.ephemeral);
      const r = await api<{ salt: string; address: string }>('/api/auth/google', {
        idToken,
        ephemeralPublicKey: toBase64(kp.getPublicKey().toRawBytes()),
        maxEpoch: pending.maxEpoch,
        randomness: pending.randomness,
      });
      setStep('Setting up your wallet');
      const proof = await api<ZkProof>('/api/auth/zk-proof', {
        jwt: idToken,
        extendedEphemeralPublicKey: getExtendedEphemeralPublicKey(kp.getPublicKey()),
        maxEpoch: pending.maxEpoch,
        jwtRandomness: pending.randomness,
      });
      const session = { ephemeral: pending.ephemeral, maxEpoch: pending.maxEpoch, randomness: pending.randomness, jwt: idToken, salt: r.salt, address: r.address, proof };
      saveZk(session);
      await adoptWallet(zkWallet(session)!);
      router.replace(pending.returnTo.startsWith('/') ? pending.returnTo : '/play');
    })().catch((e: Error) => setError(e.message || 'Google sign in did not work. Please try again.'));
  }, [adoptWallet, router]);

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="glass flex w-full max-w-sm flex-col items-center gap-4 rounded-card p-6 text-center">
        <Logo className="size-12" />
        {error ? (
          <>
            <p className="t-title">Sign in did not finish</p>
            <p className="text-text-2">{error}</p>
            <Button onClick={() => router.replace('/')}>Back to Cold Call</Button>
          </>
        ) : (
          <>
            <Spinner className="size-6" />
            <p className="font-semibold" role="status">
              {step}
            </p>
            <p className="text-sm text-text-2">This takes a few seconds.</p>
          </>
        )}
      </div>
    </main>
  );
}
