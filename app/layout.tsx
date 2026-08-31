import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Layline — Lake Michigan Sailing Weather",
  description: "Wind observation, multi-model forecasts, and tactical briefings for sailors racing on Lake Michigan",
};

const themeInitScript = `
(function() {
  try {
    var pref = localStorage.getItem('layline-theme-preference');
    if (pref === 'nightvision') {
      document.documentElement.classList.add('theme-nightvision');
    } else if (pref === 'auto' || !pref) {
      var now = new Date();
      var rad = Math.PI / 180;
      var lat = 41.89 * rad;
      var d = Math.ceil((now - new Date(now.getFullYear(),0,1)) / 86400000);
      var decl = -23.45 * rad * Math.cos(rad * 360 / 365 * (d + 10));
      var ha = Math.acos(
        (Math.cos(96 * rad) - Math.sin(lat) * Math.sin(decl)) /
        (Math.cos(lat) * Math.cos(decl))
      );
      var noon = 12 - (-87.60 / 15) - (now.getTimezoneOffset() / 60);
      var dawn = noon - (ha / rad) / 15;
      var dusk = noon + (ha / rad) / 15;
      var hours = now.getHours() + now.getMinutes() / 60;
      if (hours < dawn || hours > dusk) {
        document.documentElement.classList.add('theme-nightvision');
      }
    }
  } catch(e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
