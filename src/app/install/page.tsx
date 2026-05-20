import type { Metadata } from "next";
import InstallAppPage from "@/components/InstallAppPage";

export const metadata: Metadata = {
  title: "Install Ena Fleet Insights",
  description:
    "Install the Ena Coach fleet operations app on your phone — live GPS, driver evaluation, and reports from your home screen.",
  openGraph: {
    title: "Install Ena Fleet Insights",
    description: "Add Ena Fleet Insights to your home screen in seconds — no app store required.",
    images: [{ url: "/enalogo.png", width: 512, height: 512, alt: "Ena Coach" }],
  },
};

export default function InstallPage() {
  return <InstallAppPage />;
}
