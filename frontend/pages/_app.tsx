import type { AppProps } from 'next/app';
import '../styles/globals.css';
import { ToastProvider } from '../components/Toast';
import Footer from '../components/Footer';

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ToastProvider>
      <Component {...pageProps} />
      <Footer />
    </ToastProvider>
  );
}