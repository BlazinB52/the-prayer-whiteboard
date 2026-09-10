"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";

export function SenderUniversalScript() {
  const pathname = usePathname();

  if (pathname?.startsWith("/admin")) return null;

  return (
    <Script id="sender-universal" strategy="afterInteractive">
      {`
        (function (s, e, n, d, er) {
          s['Sender'] = er;
          s[er] = s[er] || function () {
            (s[er].q = s[er].q || []).push(arguments)
          }, s[er].l = 1 * new Date();
          s[er].on = function(event, callback) {
            s[er].listeners = s[er].listeners || {};
            (s[er].listeners[event] = s[er].listeners[event] || []).push(callback);
          };
          var a = e.createElement(n),
              m = e.getElementsByTagName(n)[0];
          a.async = 1;
          a.src = d;
          m.parentNode.insertBefore(a, m)
        })(window, document, 'script', 'https://cdn.sender.net/accounts_resources/universal.js', 'sender');
        sender('7fbd75617e6215')
      `}
    </Script>
  );
}
