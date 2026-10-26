import {
  ArrowUpRightIcon,
  DownloadSimpleIcon,
  PlusIcon,
} from "@phosphor-icons/react/dist/ssr";
import { type Metadata } from "next";
import Image from "next/image";

import { siteIconMetadata } from "~/lib/icons/siteIconMetadata";

import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

import CopyCommand from "./CopyCommand";
import {
  CLAUDE_DESKTOP_EXTENSION_PATH,
  EXAMPLE_EXPORT_PATH,
  MCP_PACKAGE,
  MCP_SERVER_CONFIG,
  NPM_PACKAGE_URL,
  SETUP_PAGE_PATH,
  claudeCodeCommand,
  cursorInstallLink,
} from "./setup";

const title = "Use with AI assistants | Weightlifting App";
const description =
  "Set up Claude, Cursor and other MCP apps to answer questions about your Weightlifting App workouts, exercise history and Personal Records.";
const appIcon = "/images/weightlifting/app-icon-256.jpg";

export const metadata: Metadata = {
  title,
  description,
  // The app's own rainbow tile, which the Weightlifting section already serves.
  icons: siteIconMetadata("/weightlifting"),
  alternates: { canonical: SETUP_PAGE_PATH },
  openGraph: {
    title,
    description,
    url: SETUP_PAGE_PATH,
    siteName: "Chappy Asel",
    locale: "en_US",
    type: "website",
    images: [
      { url: appIcon, width: 256, height: 256, alt: "Weightlifting App" },
    ],
  },
  twitter: {
    card: "summary",
    site: "@chappyasel",
    creator: "@chappyasel",
    title,
    description,
    images: [appIcon],
  },
};

const QUESTIONS = [
  "What are my bench press Personal Records?",
  "How has my squat changed this year?",
  "What did I train most last month?",
  "What did I do in my last workout?",
];

const linkClass =
  "underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground";

function NodeRequirement() {
  return (
    <>
      Needs{" "}
      <a
        href="https://nodejs.org"
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
      >
        Node.js
      </a>{" "}
      20 or newer.
    </>
  );
}

function ClientCard({
  name,
  requirement,
  children,
}: {
  name: string;
  requirement: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="shadow-none">
      <CardHeader className="space-y-1 p-5 pb-3">
        <CardTitle className="text-lg">
          <h3>{name}</h3>
        </CardTitle>
        <CardDescription>{requirement}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-3 p-5 pt-0">
        {children}
      </CardContent>
    </Card>
  );
}

export default function WeightliftingAppAiPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-12 px-4 py-16 font-sans leading-relaxed text-foreground sm:px-6 sm:py-24">
      <header className="flex flex-col gap-4">
        <div className="flex items-center gap-3 font-bold text-muted-foreground">
          <Image
            src={appIcon}
            alt=""
            width={36}
            height={36}
            className="size-9 rounded-[22%]"
          />
          Weightlifting App
        </div>
        <h1 className="font-rounded text-3xl font-bold">
          Use with AI assistants
        </h1>
        <p className="text-lg">
          Claude, Cursor and other MCP apps can answer questions about your
          Weightlifting App training, including your workouts, exercise history
          and Personal Records. Access is read-only. The server runs on your
          computer and reads a copy of your data from iCloud Drive. Your data
          goes only to the AI app you connect.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">1. On your iPhone</h2>
        <p>
          In Weightlifting App, open <strong>Settings</strong>, then{" "}
          <strong>Use with AI assistants</strong>, and turn on{" "}
          <strong>Keep a copy in iCloud Drive</strong>. The app updates the copy
          after every workout.
        </p>
        <p className="text-muted-foreground">
          This needs a Mac signed in to the same Apple ID, with iCloud Drive
          turned on.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">2. On your Mac</h2>
        <p>Connect any of these apps.</p>
        <div className="flex flex-col gap-4">
          <ClientCard name="Claude Desktop" requirement="No Node.js needed.">
            <p>
              Download the extension and double-click it. Claude Desktop opens
              and installs it.
            </p>
            <Button asChild variant="outline">
              <a href={CLAUDE_DESKTOP_EXTENSION_PATH} download>
                <DownloadSimpleIcon aria-hidden />
                Download extension
              </a>
            </Button>
          </ClientCard>
          <ClientCard name="Claude Code" requirement={<NodeRequirement />}>
            <p>Run this in Terminal:</p>
            <div className="w-full">
              <CopyCommand command={claudeCodeCommand()} />
            </div>
          </ClientCard>
          <ClientCard name="Cursor" requirement={<NodeRequirement />}>
            <p>Click the button, then confirm the install in Cursor.</p>
            <Button asChild variant="outline">
              <a href={cursorInstallLink()}>
                <PlusIcon aria-hidden />
                Add to Cursor
              </a>
            </Button>
          </ClientCard>
        </div>
        <p className="text-muted-foreground">
          Other MCP apps can start the server with{" "}
          <code className="font-mono text-sm text-foreground">
            {[MCP_SERVER_CONFIG.command, ...MCP_SERVER_CONFIG.args].join(" ")}
          </code>
          .
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Questions to ask</h2>
        <ul className="ml-5 list-disc space-y-1.5">
          {QUESTIONS.map((question) => (
            <li key={question}>{`"${question}"`}</li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Without a Mac or iCloud Drive</h2>
        <p>
          In Weightlifting App, open <strong>Settings</strong>, then{" "}
          <strong>Export all data</strong>, and save the file to your computer.
          Add the file&apos;s path to the end of the Claude Code command:
        </p>
        <CopyCommand command={claudeCodeCommand(EXAMPLE_EXPORT_PATH)} />
        <p>
          In other apps, add the path as the last of the server&apos;s
          arguments. The file is a snapshot. To see newer workouts, export again
          and replace it.
        </p>
      </section>

      <p className="text-muted-foreground">
        The README, with every tool and the Export format, is on npm at{" "}
        <a
          href={NPM_PACKAGE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={`${linkClass} text-foreground`}
        >
          {MCP_PACKAGE}
          <ArrowUpRightIcon
            aria-hidden
            weight="bold"
            className="ml-0.5 inline size-3.5 align-baseline opacity-60"
          />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
        .
      </p>
    </main>
  );
}
