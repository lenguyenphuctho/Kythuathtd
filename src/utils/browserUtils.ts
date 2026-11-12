/**
 * Browser and device detection utilities for mobile and iOS optimization.
 */

export interface InAppBrowserInfo {
  isInApp: boolean;
  appName: string;
  isIOS: boolean;
  isAndroid: boolean;
  isSafari: boolean;
  isStandalone: boolean;
}

export function detectBrowserEnvironment(): InAppBrowserInfo {
  if (typeof window === 'undefined') {
    return {
      isInApp: false,
      appName: '',
      isIOS: false,
      isAndroid: false,
      isSafari: false,
      isStandalone: false,
    };
  }

  const ua = (navigator.userAgent || navigator.vendor || (window as any).opera || '').toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua) && !(window as any).MSStream;
  const isAndroid = /android/.test(ua);
  const isSafari = isIOS && ua.includes('safari') && !ua.includes('crios') && !ua.includes('fxios');

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;

  // In-app browser detection signatures
  let isInApp = false;
  let appName = '';

  if (ua.includes('zalo')) {
    isInApp = true;
    appName = 'Zalo';
  } else if (
    ua.includes('fban') ||
    ua.includes('fbav') ||
    ua.includes('fbia') ||
    ua.includes('fb_iab') ||
    ua.includes('messenger')
  ) {
    isInApp = true;
    appName = 'Facebook / Messenger';
  } else if (ua.includes('instagram')) {
    isInApp = true;
    appName = 'Instagram';
  } else if (ua.includes('tiktok') || ua.includes('bytedance')) {
    isInApp = true;
    appName = 'TikTok';
  } else if (ua.includes('line/')) {
    isInApp = true;
    appName = 'Line';
  } else if (ua.includes('micromessenger')) {
    isInApp = true;
    appName = 'WeChat';
  } else if (isAndroid && (ua.includes('; wv') || ua.includes('version/4.0'))) {
    isInApp = true;
    appName = 'Ứng dụng';
  }

  return {
    isInApp,
    appName,
    isIOS,
    isAndroid,
    isSafari,
    isStandalone,
  };
}
