import './globals.css';

export const metadata = {
  title: 'Cold Case Detective',
  description: 'AI-powered detective assistant for analyzing evidence',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
