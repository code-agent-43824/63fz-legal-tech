import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "63-ФЗ об электронной подписи",
  description: "Структурированный legal-tech интерфейс для чтения и комментирования 63-ФЗ.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
