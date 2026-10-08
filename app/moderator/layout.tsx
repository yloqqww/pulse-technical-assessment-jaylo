import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pulse Moderation Station",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function ModeratorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
