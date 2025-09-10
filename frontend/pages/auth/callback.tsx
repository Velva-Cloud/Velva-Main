import { useRouter } from 'next/router';
import { useEffect } from 'react';

export default function OAuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const t = router.query.token as string | undefined;
    if (t) {
      localStorage.setItem('token', t);
      router.replace('/dashboard');
    }
  }, [router]);

  return <div className="p-6">Completing sign-in...</div>;
}