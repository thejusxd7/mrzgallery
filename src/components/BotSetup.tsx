import React, { useState } from "react";
import { BotConfig, BotStatus } from "../types";
import { Bot, HelpCircle, Lock, Eye, EyeOff, CheckCircle, Wifi, AlertTriangle, Play, HelpCircle as InfoIcon, Send, Sparkles, Image, Check, Server, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface BotSetupProps {
  config: BotConfig & { hasToken: boolean };
  status: BotStatus;
  onSaveConfig: (token: string, channelId: string) => Promise<boolean>;
  onTriggerTestPost: (authorName: string, content: string, category: string, authorAvatar?: string, authorTag?: string) => Promise<boolean>;
  onClearBoard: () => Promise<void> | void;
}

export const BotSetup: React.FC<BotSetupProps> = ({ config, status, onSaveConfig, onTriggerTestPost, onClearBoard }) => {
  const [tokenInput, setTokenInput] = useState("");
  const [channelInput, setChannelInput] = useState(config.channelId || "");
  const [revealToken, setRevealToken] = useState(false);
  const [collapsedGuide, setCollapsedGuide] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Simulation controls state
  const [customAuthor, setCustomAuthor] = useState("Dev_Emily");
  const [customContent, setCustomContent] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [isPostingSim, setIsPostingSim] = useState(false);
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);

  // Initialize display
  React.useEffect(() => {
    // If we have a stored token, prefill with a masked string
    if (config.hasToken) {
      setTokenInput("••••••••••••••••••••••••••••");
    }
  }, [config.hasToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const success = await onSaveConfig(tokenInput, channelInput);
      if (success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSimSubmit = async (categoryPreset: string) => {
    setIsPostingSim(true);
    try {
      let author = customAuthor;
      let text = customContent;
      let cat = categoryPreset;
      let authorAvatar: string | undefined = undefined;
      let authorTag: string | undefined = undefined;

      if (!cat) { // custom text
        author = status.botName || "Sync Bot";
        authorAvatar = status.botAvatarUrl || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=120";
        authorTag = "Bot#0000";
        text = customContent.trim() || "Beep Boop! Sending an instant micro post to check the live websocket stream! 🚀📡";
        cat = "";
      } else if (cat === "image") {
        author = "Jake_Illustrator";
        text = "Check out this amazing mockup design. Clean data dashboards look magnificent! Let me know if we need changes.";
      } else if (cat === "nature") {
        author = "Sarah_Explorer";
        text = "Waking up to this breathtaking view in the mountains earlier. Totally refreshing! 🏔️🌞⛺";
      }

      await onTriggerTestPost(author, text, cat, authorAvatar, authorTag);
      if (!categoryPreset) {
        setCustomContent("");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsPostingSim(false);
    }
  };

  const currentStatusColors = {
    online: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", indicator: "bg-emerald-500" },
    connecting: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", indicator: "bg-amber-500 animate-pulse" },
    offline: { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200", indicator: "bg-slate-400" },
    error: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", indicator: "bg-red-500 animate-ping" }
  }[status.status] || { bg: "bg-slate-50", text: "text-slate-605", border: "border-slate-200", indicator: "bg-slate-400" };

  return (
    <div className="space-y-6">
      {/* Dynamic Connection Status Banner */}
      <div className={`p-4 rounded-xl border ${currentStatusColors.border} ${currentStatusColors.bg} transition-all duration-300 relative overflow-hidden`} id="bot-status-banner">
        <div className="flex items-start gap-3">
          <div className="mt-1 flex-shrink-0">
            <span className={`flex h-2.5 w-2.5 rounded-full ${currentStatusColors.indicator}`} />
          </div>
          <div>
            <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-500">
              Live Monitor Status
            </h3>
            <p className="text-sm font-semibold text-slate-800 capitalize mt-0.5">
              Bot Gateway: {status.status}
            </p>
            {status.status === "online" && status.monitoredChannel && (
              <div className="text-xs text-slate-600 mt-1 space-y-0.5">
                <p className="flex items-center gap-1">
                  <span className="font-semibold text-slate-700">Server:</span> {status.monitoredChannel.guildName || "Discord Server"}
                </p>
                <p className="flex items-center gap-1">
                  <span className="font-semibold text-slate-700">Channel:</span> #{status.monitoredChannel.name}
                </p>
              </div>
            )}
            {status.status === "error" && status.error && (
              <p className="text-xs text-red-600 font-mono mt-1 leading-relaxed bg-white/50 p-2 rounded border border-red-100">
                Error: {status.error}
              </p>
            )}
            {status.status === "connecting" && (
              <p className="text-xs text-amber-600 mt-1">
                Authenticating with Discord gateway...
              </p>
            )}
            {status.status === "offline" && (
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Provide your bot credentials below to establish a live Gateway connection to your Discord server.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Bot Setup Form Card */}
      <div className="liquid-glass-yellow-card rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold font-display text-amber-950 flex items-center gap-2">
            <Bot className="w-4 h-4 text-amber-700" />
            <span>Connect Discord Bot</span>
          </h2>
          <button
            onClick={() => setCollapsedGuide(!collapsedGuide)}
            className="text-xs text-amber-800 hover:text-amber-950 font-bold flex items-center gap-1"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>{collapsedGuide ? "Show Tutorial" : "Hide" }</span>
          </button>
        </div>

        {/* Integration Tutorial Guide */}
        <AnimatePresence>
          {!collapsedGuide && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 text-xs text-slate-600 my-2 space-y-3 leading-relaxed">
                <p className="font-semibold text-slate-700 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  How to setup your Discord bot:
                </p>
                <ol className="list-decimal list-inside space-y-1.5 font-sans">
                  <li>
                    Go to the{" "}
                    <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline inline-flex items-center gap-0.5 font-medium">
                      Discord Developer Portal <span className="text-[10px]">↗</span>
                    </a>
                  </li>
                  <li>Create an <strong>Application</strong>, then under of <strong>"Bot"</strong> tab, generate a Bot.</li>
                  <li>
                    <strong>CRITICAL STEP:</strong> Scroll down on the Bot tab can find <strong>"Privileged Gateway Intents"</strong>. 
                    Toggle the <strong className="text-indigo-600">"MESSAGE CONTENT INTENT"</strong> on. (Without this, the bot compiles empty texts!).
                  </li>
                  <li>Copy the <strong>Token</strong> and paste it below.</li>
                  <li>
                    Invite your Bot to your server. Under <strong>OAuth2 → URL Generator</strong>, tick <code>bot</code>, and under permissions, tick <code>View Channels</code>, <code>Read Message History</code>. Open the link to invite it.
                  </li>
                  <li>Right-click on your Discord Text Channel → <strong>"Copy Channel ID"</strong> (Ensure Developer Mode is ON in Discord Advanced settings) and paste it below.</li>
                </ol>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-amber-900 flex items-center justify-between">
              <span>Discord Bot Token</span>
              <span className="text-[10px] text-amber-600/80 font-mono">Secret</span>
            </label>
            <div className="relative">
              <input
                type={revealToken ? "text" : "password"}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Paste bot account token (Mjg...)"
                required
                className="w-full text-xs font-mono px-3.5 py-2.5 pr-10 rounded-lg border border-amber-200 bg-white/60 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200/40 transition-all placeholder-amber-900/30 font-medium"
              />
              <button
                type="button"
                onClick={() => setRevealToken(!revealToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-700 hover:text-amber-955 cursor-pointer"
              >
                {revealToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-amber-900 flex items-center justify-between">
              <span>Monitored Channel ID</span>
              <span className="text-[10px] text-amber-600/80 font-mono font-bold">18+ Digits</span>
            </label>
            <input
              type="text"
              value={channelInput}
              onChange={(e) => setChannelInput(e.target.value)}
              placeholder="e.g. 1042784568912345678"
              required
              className="w-full text-xs font-mono px-3.5 py-2.5 rounded-lg border border-amber-200 bg-white/60 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200/40 transition-all placeholder-amber-900/30 font-medium"
            />
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full btn-gel-primary text-xs font-black py-2.5 rounded-lg shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            {isSaving ? (
              <>
                <svg className="animate-spin h-4.5 w-4.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Saving & Linking...</span>
              </>
            ) : saveSuccess ? (
              <>
                <Check className="w-4.5 h-4.5 text-white" />
                <span>Link Saved Successfully!</span>
              </>
            ) : (
              <>
                <Server className="w-4 h-4" />
                <span>Link Channel & Connect Bot</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Real-time Sandbox Interactive Module */}
      <div className="liquid-glass-yellow-card rounded-xl p-5 space-y-4">
        <div>
          <h3 className="text-xs font-bold font-display text-amber-950 uppercase tracking-widest flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-600 animate-pulse" />
            <span>Sandbox Integration Simulator</span>
          </h3>
          <p className="text-[11px] text-amber-900/70 leading-relaxed mt-1">
            No API token ready yet? No worries! Tap one of our pre-designed designer posts to broadcast simulated actions from Discord with rich attachments to the feed!
          </p>
        </div>

        {/* Demo trigger quick grids */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handleSimSubmit("image")}
            disabled={isPostingSim}
            className="flex items-center gap-1.5 justify-center py-2 px-3 border border-amber-300/40 bg-white/70 hover:bg-amber-100/50 active:bg-amber-200/50 text-[11px] font-bold text-amber-900 rounded-lg shadow-2xs hover:border-amber-300 transition-all cursor-pointer disabled:opacity-50 font-sans"
          >
            <Image className="w-3.5 h-3.5 text-amber-600" />
            <span>Simulate Schematic</span>
          </button>
          
          <button
            onClick={() => handleSimSubmit("nature")}
            disabled={isPostingSim}
            className="flex items-center gap-1.5 justify-center py-2 px-3 border border-amber-300/40 bg-white/70 hover:bg-amber-100/50 active:bg-amber-200/50 text-[11px] font-bold text-amber-900 rounded-lg shadow-2xs hover:border-amber-300 transition-all cursor-pointer disabled:opacity-50 font-sans"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span>Simulate Landscape</span>
          </button>
        </div>

        {/* Custom text dispatch box */}
        <div className="space-y-1.5 pt-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-amber-800/80">
            Dispatch Custom Chat
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={customContent}
              onChange={(e) => setCustomContent(e.target.value)}
              placeholder="e.g. Is anyone attending the standup? 🔥"
              className="flex-1 bg-white/80 border border-amber-200 rounded-lg text-xs font-sans px-3 py-1.5 outline-none focus:border-amber-400 transition-all placeholder-amber-900/30 font-medium text-slate-800"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isPostingSim) {
                  handleSimSubmit("");
                }
              }}
            />
            <button
              onClick={() => handleSimSubmit("")}
              disabled={isPostingSim}
              className="btn-gel-primary p-2 rounded-lg shadow-2xs flex-shrink-0 cursor-pointer transition-all disabled:opacity-60"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Danger Zone Purge Controls */}
      <div className="bg-red-50/45 border border-red-100 rounded-xl p-5 space-y-3.5" id="danger-zone-purge">
        <div>
          <h3 className="text-xs font-bold font-display text-red-800 uppercase tracking-widest flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span>Danger &amp; Purge Zone</span>
          </h3>
          <p className="text-[11px] text-red-600/80 leading-relaxed mt-1">
            Remove all synced message feeds from memory and storage instantly.
          </p>
        </div>

        <AnimatePresence mode="wait">
          {!showPurgeConfirm ? (
            <button
              onClick={() => setShowPurgeConfirm(true)}
              className="w-full flex items-center gap-1.8 justify-center py-2.5 px-4 bg-red-600 hover:bg-red-750 active:bg-red-800 text-white text-xs font-bold rounded-lg shadow-2xs hover:shadow-xs transition-all cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Clear All Messages</span>
            </button>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="bg-white border border-red-200 rounded-xl p-4 space-y-3 shadow-md"
            >
              <div className="flex gap-2">
                <AlertTriangle className="w-4.5 h-4.5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] font-semibold text-slate-800 leading-snug">
                  Are you absolutely sure? This will permanently wipe all synchronized feeds. Discord servers won&#39;t be affected.
                </p>
              </div>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setShowPurgeConfirm(false)}
                  className="flex-1 py-2 px-3 border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold rounded-lg transition-all cursor-pointer bg-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await onClearBoard();
                    setShowPurgeConfirm(false);
                  }}
                  className="flex-1 py-2 px-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-all cursor-pointer shadow-xs"
                >
                  Yes, Purge Feed
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
