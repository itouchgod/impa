import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PDFTextProvider } from "@/contexts/PDFTextContext";
import { SearchIndexProvider } from "@/contexts/SearchIndexContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import DevToolsInit from "@/components/DevToolsInit";
import ExtensionGuard from "@/components/ExtensionGuard";
import Script from 'next/script';
import { headers } from "next/headers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IMPA Marine Stores Guide",
  description: "IMPA Marine Stores Guide 8th Edition 2023 - Smart Search Platform",
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/icon-192x192.png',
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'IMPA',
  },
  formatDetection: {
    telephone: false,
  },
};

// 避免被静态化缓存
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 🔧 关键修复：headers() 需要 await
  const h = await headers();
  const nonce = h.get("x-nonce") || "";

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        <meta name="application-name" content="IMPA" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="IMPA" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#2563eb" />
        
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icon-48x48.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icon-48x48.png" />
        <link rel="shortcut icon" href="/icon-48x48.png" type="image/png" />
        
        {/* 早期扩展防护脚本 */}
        <Script
          id="extension-guard-early"
          strategy="beforeInteractive"
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `
              // 立即启动扩展防护，防止浏览器扩展干扰
              (function() {
                const originalError = console.error;
                const originalWarn = console.warn;
                
                // 扩展错误关键词列表 - 全面覆盖
                const extensionKeywords = [
                  'chext_', 'metadata.js', 'contentscript.js', 'content.js',
                  'chext_driver.js', 'chext_loader.js', 'chrome-extension://',
                  'net::ERR_ABORTED', '404 (Not Found)', 'siteDubbingRules',
                  'ender metadata', 'mountUi return undefined', 'yt-ext-',
                  'cz-shortcut-listen', 'Skipping ads',
                  'Failed to execute \\'observe\\' on \\'MutationObserver\\'',
                  'parameter 1 is not of type \\'Node\\'',
                  'Unexpected identifier \\'observe\\'',
                  'appendChild\\' on \\'Node\\'',
                  'Failed to execute \\'appendChild\\' on \\'Node\\'',
                  'Failed to execute \\'appendChild\\' on \\'Node\\': Unexpected identifier \\'observe\\'',
                  'Hydration failed', 'hydrated but some attributes',
                  'server rendered HTML didn\\'t match', 'hydration mismatch',
                  'throwOnHydrationMismatch',
                  'vendors-326d2db556600f52.js', 'webpack-f9bdc8f8e7ef5feb.js',
                  'main-app-e131d669f65d8db7.js', 'index.ts-loader3.js',
                  'VM210:14', 'VM531:14', 'VM56:14', 'VM110:14', 'VM247:14',
                  'vendors-326d2db556600f52.js:1:126815',
                  'vendors-326d2db556600f52.js:1:126622', 'VM'
                ];
                
                // VM 脚本模式匹配
                const vmPatterns = [
                  /VM\\d+:14/, /VM\\d+:\\d+/, /eval @ app-bootstrap\\.js/,
                  /eval @ app-next-dev\\.js/, /vendors-\\w+\\.js/,
                  /webpack-\\w+\\.js/, /main-app-\\w+\\.js/
                ];
                
                function isExtensionError(args) {
                  const message = args[0];
                  if (typeof message !== 'string') return false;
                  
                  // 检查关键词匹配
                  const hasKeyword = extensionKeywords.some(keyword => 
                    message.includes(keyword)
                  );
                  
                  // 检查VM脚本模式
                  const hasVMPattern = vmPatterns.some(pattern => 
                    pattern.test(message)
                  );
                  
                  // 检查堆栈跟踪
                  const stack = args[1] || '';
                  const hasStackKeyword = typeof stack === 'string' && 
                    extensionKeywords.some(keyword => stack.includes(keyword));
                  
                  return hasKeyword || hasVMPattern || hasStackKeyword;
                }
                
                console.error = function(...args) {
                  if (isExtensionError(args)) {
                    return; // 静默处理扩展错误
                  }
                  originalError.apply(console, args);
                };
                
                console.warn = function(...args) {
                  if (isExtensionError(args)) {
                    return; // 静默处理扩展警告
                  }
                  originalWarn.apply(console, args);
                };
                
                // 全局错误处理
                const originalOnError = window.onerror;
                window.onerror = function(message, source, lineno, colno, error) {
                  if (isExtensionError([message, source])) {
                    return true; // 阻止错误传播
                  }
                  if (originalOnError) {
                    return originalOnError.call(window, message, source, lineno, colno, error);
                  }
                  return false;
                };
                
                // 未捕获的 Promise 错误处理
                const originalOnUnhandledRejection = window.onunhandledrejection;
                window.onunhandledrejection = function(event) {
                  if (isExtensionError([event.reason])) {
                    event.preventDefault();
                    return;
                  }
                  if (originalOnUnhandledRejection) {
                    return originalOnUnhandledRejection.call(window, event);
                  }
                };
              })();
            `,
          }}
        />
        
        {/* 注册 Service Worker - 使用 nonce */}
        <Script
          id="register-sw"
          strategy="afterInteractive"
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').then(
                    function(registration) {
                      // ServiceWorker registered successfully
                    },
                    function(err) {
                      console.error('ServiceWorker registration failed: ', err);
                    }
                  );
                });
              }
            `,
          }}
        />
        
      </head>
      <body data-nonce={nonce} suppressHydrationWarning={true}>
        <ExtensionGuard 
          enableLogging={process.env.NODE_ENV === 'development'}
          enableIsolation={true}
          enableErrorSuppression={true}
          enableDOMProtection={true}
        />
        <ThemeProvider>
          <SearchIndexProvider>
            <PDFTextProvider>
              <DevToolsInit />
              {children}
            </PDFTextProvider>
          </SearchIndexProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
