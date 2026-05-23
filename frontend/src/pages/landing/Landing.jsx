import { Link } from 'react-router-dom';
import {
  ArrowRightIcon,
  BoltIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ClipboardDocumentListIcon,
  DocumentTextIcon,
  FunnelIcon,
  MegaphoneIcon,
  PhoneArrowUpRightIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';

const useCases = [
  'Education',
  'Healthcare',
  'Real estate',
  'Retail',
  'Travel',
  'Local services',
];

const modules = [
  { title: 'Capture', text: 'Collect leads from WhatsApp, landing forms, CSV imports, and campaigns.', icon: FunnelIcon },
  { title: 'Qualify', text: 'Understand intent like pricing, booking, support, demo, appointment, or callback.', icon: SparklesIcon },
  { title: 'Convert', text: 'Send approved templates, follow-ups, reminders, and broadcasts from one workspace.', icon: PhoneArrowUpRightIcon },
];

const features = [
  { title: 'Meta Cloud API setup', text: 'Connect phone numbers, webhooks, business accounts, and message delivery in a guided flow.', icon: ChatBubbleLeftRightIcon },
  { title: 'Automation builder', text: 'Build keyword journeys, smart replies, fallback paths, and session-based customer flows.', icon: BoltIcon },
  { title: 'Templates and flows', text: 'Create WhatsApp templates and flow forms with live mobile previews before publishing.', icon: DocumentTextIcon },
  { title: 'Broadcast campaigns', text: 'Send approved templates to selected contacts, tags, statuses, and customer segments.', icon: MegaphoneIcon },
];

const workflow = [
  'Connect your WhatsApp Business number',
  'Create templates, flows, chatbot rules, and broadcasts',
  'Track contacts, replies, delivery, and follow-up status',
];

export default function Landing() {
  return (
    <div className="biz-landing">
      <style>{`
        .biz-landing {
          min-height: 100vh;
          overflow-x: hidden;
          color: #10201d;
          background:
            radial-gradient(circle at 18% 10%, rgba(37, 211, 102, .18), transparent 28%),
            radial-gradient(circle at 86% 12%, rgba(18, 140, 126, .16), transparent 30%),
            linear-gradient(180deg, #f7fffb 0%, #ecfdf5 48%, #f8fafc 100%);
          position: relative;
        }

        .biz-landing * { box-sizing: border-box; }

        .biz-landing::before {
          content: "";
          position: fixed;
          inset: 0;
          pointer-events: none;
          background-image:
            linear-gradient(rgba(7, 94, 84, .045) 1px, transparent 1px),
            linear-gradient(90deg, rgba(7, 94, 84, .045) 1px, transparent 1px);
          background-size: 44px 44px;
          mask-image: linear-gradient(180deg, black, transparent 78%);
        }

        .biz-nav,
        .biz-hero,
        .biz-stats,
        .biz-section,
        .biz-workflow,
        .biz-feature-grid,
        .biz-final {
          width: min(1180px, calc(100% - 36px));
          margin-left: auto;
          margin-right: auto;
          position: relative;
          z-index: 1;
        }

        .biz-nav {
          position: sticky;
          top: 14px;
          z-index: 30;
          margin-top: 14px;
          padding: 12px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          border: 1px solid rgba(209, 250, 229, .9);
          border-radius: 24px;
          background: rgba(255, 255, 255, .78);
          box-shadow: 0 18px 48px rgba(7, 94, 84, .1);
          backdrop-filter: blur(18px);
        }

        .biz-brand {
          display: inline-flex;
          align-items: center;
          gap: 12px;
        }

        .biz-brand > span {
          width: 44px;
          height: 44px;
          border-radius: 15px;
          display: grid;
          place-items: center;
          background: linear-gradient(135deg, #075E54, #128C7E);
          color: #fff;
          font-weight: 950;
          box-shadow: 0 14px 28px rgba(7, 94, 84, .2);
        }

        .biz-brand b,
        .biz-brand small { display: block; }
        .biz-brand b { color: #075E54; font-size: 18px; line-height: 1.1; }
        .biz-brand small { color: #64748b; font-size: 11px; font-weight: 850; }

        .biz-nav-links {
          display: flex;
          align-items: center;
          gap: 6px;
          border: 1px solid rgba(209, 250, 229, .92);
          border-radius: 999px;
          background: rgba(236, 253, 245, .7);
          padding: 4px;
        }

        .biz-nav-links a,
        .biz-nav-actions a {
          border-radius: 999px;
          padding: 9px 13px;
          color: #0f766e;
          font-size: 12px;
          font-weight: 900;
          transition: transform .18s ease, background .18s ease, color .18s ease, box-shadow .18s ease;
        }

        .biz-nav-links a:hover,
        .biz-nav-actions a:hover {
          transform: translateY(-1px);
          background: #fff;
          color: #075E54;
        }

        .biz-nav-actions { display: flex; align-items: center; gap: 8px; }

        .biz-nav-actions .biz-nav-cta {
          background: linear-gradient(135deg, #075E54, #128C7E);
          color: #fff;
          box-shadow: 0 14px 28px rgba(7, 94, 84, .18);
        }

        .biz-hero {
          min-height: calc(100vh - 92px);
          display: grid;
          grid-template-columns: minmax(0, 1.05fr) minmax(340px, 470px);
          gap: 58px;
          align-items: center;
          padding: 54px 0 44px;
        }

        .biz-eyebrow,
        .biz-section-kicker {
          width: max-content;
          max-width: 100%;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: 1px solid rgba(37, 211, 102, .24);
          border-radius: 999px;
          background: rgba(236, 253, 245, .9);
          color: #047857;
          padding: 9px 13px;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: .08em;
          text-transform: uppercase;
        }

        .biz-eyebrow svg { width: 16px; height: 16px; }

        .biz-hero h1 {
          max-width: 780px;
          margin: 20px 0 0;
          color: #075E54;
          font-size: clamp(44px, 5.8vw, 76px);
          line-height: .94;
          letter-spacing: 0;
          text-wrap: balance;
        }

        .biz-hero p {
          max-width: 670px;
          margin: 20px 0 0;
          color: #475569;
          font-size: 18px;
          line-height: 1.7;
        }

        .biz-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 30px;
        }

        .biz-primary,
        .biz-secondary {
          min-height: 52px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          border-radius: 17px;
          padding: 0 20px;
          font-size: 14px;
          font-weight: 950;
          transition: transform .18s ease, box-shadow .18s ease;
        }

        .biz-primary {
          background: linear-gradient(135deg, #075E54, #128C7E);
          color: #fff;
          box-shadow: 0 22px 42px rgba(7, 94, 84, .22);
        }

        .biz-secondary {
          border: 1px solid rgba(18, 140, 126, .24);
          background: rgba(255, 255, 255, .82);
          color: #075E54;
          box-shadow: 0 14px 28px rgba(7, 94, 84, .08);
        }

        .biz-primary:hover,
        .biz-secondary:hover { transform: translateY(-2px); }
        .biz-primary svg { width: 17px; height: 17px; }

        .biz-checks,
        .biz-usecases {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 22px;
        }

        .biz-checks span,
        .biz-usecases span {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: 1px solid rgba(37, 211, 102, .2);
          border-radius: 999px;
          background: rgba(255, 255, 255, .72);
          color: #047857;
          padding: 7px 10px;
          font-size: 12px;
          font-weight: 900;
        }

        .biz-checks svg { width: 16px; height: 16px; }
        .biz-usecases strong { align-self: center; color: #075E54; font-size: 12px; font-weight: 950; }

        .biz-proof {
          max-width: 560px;
          margin-top: 24px;
          display: flex;
          gap: 13px;
          align-items: flex-start;
          border: 1px solid rgba(209, 250, 229, .95);
          border-radius: 24px;
          background: rgba(255, 255, 255, .76);
          box-shadow: 0 18px 42px rgba(7, 94, 84, .08);
          padding: 16px;
          backdrop-filter: blur(14px);
        }

        .biz-proof svg {
          width: 38px;
          height: 38px;
          flex: 0 0 auto;
          border-radius: 14px;
          background: #ecfdf5;
          color: #128C7E;
          padding: 8px;
        }

        .biz-proof b,
        .biz-proof span { display: block; }
        .biz-proof b { color: #075E54; font-size: 14px; }
        .biz-proof span { margin-top: 4px; color: #64748b; font-size: 13px; line-height: 1.55; }

        .biz-preview {
          position: relative;
          min-height: 660px;
          display: grid;
          place-items: center;
          isolation: isolate;
        }

        .biz-preview::before {
          content: "";
          position: absolute;
          width: 420px;
          height: 520px;
          border-radius: 36px;
          background: linear-gradient(145deg, rgba(37, 211, 102, .16), rgba(7, 94, 84, .09));
          transform: rotate(-8deg);
          z-index: -1;
        }

        .biz-phone {
          width: min(310px, 100%);
          height: 552px;
          position: relative;
          overflow: hidden;
          border: 8px solid #06110f;
          border-radius: 44px;
          background: #ece5dd;
          box-shadow: 0 42px 92px rgba(7, 94, 84, .28);
        }

        .biz-notch {
          position: absolute;
          top: 8px;
          left: 50%;
          z-index: 3;
          width: 92px;
          height: 20px;
          transform: translateX(-50%);
          border-radius: 0 0 18px 18px;
          background: #06110f;
        }

        .biz-phone-top {
          height: 78px;
          padding: 28px 13px 10px;
          display: flex;
          align-items: center;
          gap: 10px;
          background: #075e54;
          color: #fff;
        }

        .biz-phone-top > span {
          width: 30px;
          height: 30px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          background: #25D366;
          color: #063b2f;
          font-weight: 950;
        }

        .biz-phone-top b,
        .biz-phone-top small { display: block; }
        .biz-phone-top small { color: rgba(255, 255, 255, .72); font-size: 10px; }

        .biz-chat {
          min-height: calc(100% - 144px);
          padding: 14px;
          display: grid;
          gap: 10px;
          align-content: start;
          background:
            linear-gradient(45deg, rgba(7, 94, 84, .035) 25%, transparent 25%),
            linear-gradient(-45deg, rgba(7, 94, 84, .035) 25%, transparent 25%),
            #ece5dd;
          background-size: 18px 18px;
        }

        .biz-day {
          justify-self: center;
          border-radius: 999px;
          background: rgba(255, 255, 255, .74);
          color: #64748b;
          padding: 5px 10px;
          font-size: 10px;
          font-weight: 900;
        }

        .biz-bubble {
          max-width: 86%;
          padding: 10px 12px;
          border-radius: 15px 15px 15px 5px;
          background: #fff;
          color: #1f2937;
          font-size: 13px;
          line-height: 1.45;
          box-shadow: 0 3px 10px rgba(0, 0, 0, .06);
        }

        .biz-bubble.user {
          margin-left: auto;
          border-radius: 15px 15px 5px 15px;
          background: #dcf8c6;
        }

        .biz-chat-actions {
          display: grid;
          gap: 8px;
          max-width: 86%;
        }

        .biz-chat-actions button {
          border: 1px solid rgba(18, 140, 126, .18);
          border-radius: 14px;
          background: #fff;
          color: #128c7e;
          text-align: left;
          padding: 10px 12px;
          font-weight: 900;
          font-size: 12px;
          box-shadow: 0 6px 14px rgba(15, 23, 42, .05);
        }

        .biz-compose {
          height: 56px;
          padding: 9px 10px;
          display: flex;
          align-items: center;
          gap: 8px;
          background: #f8fafc;
        }

        .biz-compose span {
          flex: 1;
          border-radius: 999px;
          background: #fff;
          color: #94a3b8;
          padding: 10px 13px;
          font-size: 12px;
          font-weight: 800;
        }

        .biz-compose b {
          min-width: 48px;
          height: 38px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          background: #25D366;
          color: #063b2f;
          font-size: 11px;
          padding: 0 10px;
          text-transform: uppercase;
          letter-spacing: .04em;
        }

        .biz-panel {
          position: absolute;
          right: -6px;
          bottom: 82px;
          width: 238px;
          border: 1px solid rgba(209, 250, 229, .92);
          border-radius: 22px;
          background: rgba(255, 255, 255, .9);
          backdrop-filter: blur(16px);
          padding: 12px;
          box-shadow: 0 22px 50px rgba(7, 94, 84, .16);
          display: grid;
          gap: 8px;
        }

        .biz-panel div {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #075E54;
          font-size: 12px;
          font-weight: 900;
        }

        .biz-panel svg { width: 18px; height: 18px; color: #25D366; }

        .biz-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
          padding-bottom: 18px;
        }

        .biz-stats div,
        .biz-module-grid article,
        .biz-feature-grid article {
          border: 1px solid rgba(209, 250, 229, .9);
          border-radius: 24px;
          background: rgba(255, 255, 255, .78);
          box-shadow: 0 18px 42px rgba(7, 94, 84, .08);
          backdrop-filter: blur(14px);
          transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
        }

        .biz-stats div:hover,
        .biz-module-grid article:hover,
        .biz-feature-grid article:hover {
          transform: translateY(-3px);
          border-color: rgba(37, 211, 102, .36);
          box-shadow: 0 24px 54px rgba(7, 94, 84, .13);
        }

        .biz-stats div { padding: 20px; }
        .biz-stats b,
        .biz-stats span { display: block; }
        .biz-stats b { color: #075E54; font-size: 26px; }
        .biz-stats span { color: #64748b; font-size: 12px; font-weight: 900; margin-top: 2px; }

        .biz-section-head {
          max-width: 760px;
          margin: 56px 0 18px;
        }

        .biz-section-head h2,
        .biz-workflow h2,
        .biz-final h2 {
          color: #075E54;
          font-size: clamp(28px, 4vw, 46px);
          line-height: 1.04;
          text-wrap: balance;
        }

        .biz-module-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }

        .biz-module-grid article {
          min-height: 230px;
          padding: 24px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, .86), rgba(255, 255, 255, .68)),
            radial-gradient(circle at top right, rgba(37, 211, 102, .16), transparent 34%);
        }

        .biz-module-grid svg,
        .biz-feature-grid svg {
          width: 46px;
          height: 46px;
          border-radius: 17px;
          padding: 10px;
          background: linear-gradient(135deg, #075E54, #128C7E);
          color: #fff;
        }

        .biz-module-grid h3,
        .biz-feature-grid h3 {
          margin: 22px 0 9px;
          color: #075E54;
          font-size: 18px;
        }

        .biz-module-grid p,
        .biz-feature-grid p {
          color: #64748b;
          font-size: 14px;
          line-height: 1.65;
        }

        .biz-workflow {
          margin-top: 24px;
          display: grid;
          grid-template-columns: minmax(0, .95fr) minmax(320px, 1fr);
          gap: 32px;
          align-items: center;
          border: 1px solid rgba(209, 250, 229, .92);
          border-radius: 32px;
          background:
            radial-gradient(circle at 10% 0%, rgba(37, 211, 102, .18), transparent 30%),
            linear-gradient(135deg, rgba(255, 255, 255, .86), rgba(236, 253, 245, .72));
          box-shadow: 0 26px 70px rgba(7, 94, 84, .1);
          padding: 30px;
        }

        .biz-workflow p {
          max-width: 520px;
          margin-top: 14px;
          color: #64748b;
          line-height: 1.7;
        }

        .biz-workflow ol {
          display: grid;
          gap: 12px;
        }

        .biz-workflow li {
          display: flex;
          align-items: center;
          gap: 14px;
          border: 1px solid rgba(209, 250, 229, .92);
          border-radius: 20px;
          background: rgba(255, 255, 255, .76);
          padding: 14px;
        }

        .biz-workflow li b {
          width: 42px;
          height: 42px;
          border-radius: 15px;
          display: grid;
          place-items: center;
          background: #075E54;
          color: #fff;
          font-size: 12px;
        }

        .biz-workflow li span {
          color: #0f172a;
          font-size: 14px;
          font-weight: 900;
        }

        .biz-feature-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
          padding: 18px 0 58px;
        }

        .biz-feature-grid article {
          padding: 20px;
        }

        .biz-feature-grid svg {
          background: #ecfdf5;
          color: #128C7E;
        }

        .biz-final {
          margin-bottom: 58px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          border-radius: 34px;
          background:
            radial-gradient(circle at top right, rgba(37, 211, 102, .28), transparent 34%),
            linear-gradient(135deg, #075E54, #128C7E);
          color: #fff;
          padding: 32px;
          box-shadow: 0 30px 76px rgba(7, 94, 84, .22);
        }

        .biz-final .biz-section-kicker {
          background: rgba(255, 255, 255, .12);
          color: #dcfce7;
          border-color: rgba(255, 255, 255, .16);
        }

        .biz-final h2 {
          max-width: 740px;
          color: #fff;
        }

        .biz-final .biz-primary {
          flex: 0 0 auto;
          background: #fff;
          color: #075E54;
          box-shadow: 0 18px 36px rgba(3, 59, 50, .18);
        }

        @media (max-width: 980px) {
          .biz-nav { top: 10px; }
          .biz-nav-links { display: none; }
          .biz-hero {
            grid-template-columns: 1fr;
            min-height: auto;
            gap: 34px;
            padding-top: 38px;
          }
          .biz-preview { min-height: auto; }
          .biz-preview::before { width: min(92vw, 430px); height: 360px; }
          .biz-panel {
            position: static;
            width: min(100%, 360px);
            margin-top: 14px;
          }
          .biz-module-grid,
          .biz-workflow { grid-template-columns: 1fr; }
          .biz-feature-grid { grid-template-columns: repeat(2, 1fr); }
          .biz-final {
            flex-direction: column;
            align-items: flex-start;
          }
        }

        @media (max-width: 640px) {
          .biz-nav,
          .biz-hero,
          .biz-stats,
          .biz-section,
          .biz-workflow,
          .biz-feature-grid,
          .biz-final {
            width: min(100% - 24px, 1180px);
          }
          .biz-nav {
            width: min(100% - 18px, 1180px);
            border-radius: 18px;
          }
          .biz-brand small { display: none; }
          .biz-nav-actions { gap: 4px; }
          .biz-nav-actions a { padding: 9px 11px; font-size: 12px; }
          .biz-hero h1 { font-size: 38px; line-height: 1; }
          .biz-hero p { font-size: 16px; }
          .biz-primary,
          .biz-secondary { width: 100%; }
          .biz-stats,
          .biz-module-grid,
          .biz-feature-grid { grid-template-columns: 1fr; }
          .biz-phone {
            width: min(290px, 100%);
            height: 516px;
            border-radius: 40px;
          }
          .biz-preview::before { display: none; }
          .biz-panel { width: min(100%, 330px); }
          .biz-workflow,
          .biz-final {
            padding: 22px;
            border-radius: 26px;
          }
          .biz-section-head { margin-top: 38px; }
        }
      `}</style>

      <nav className="biz-nav">
        <Link to="/" className="biz-brand">
          <span>W</span>
          <div>
            <b>WaAuto</b>
            <small>WhatsApp Business Automation</small>
          </div>
        </Link>
        <div className="biz-nav-links">
          <a href="#platform">Platform</a>
          <a href="#workflow">Workflow</a>
          <a href="#features">Features</a>
        </div>
        <div className="biz-nav-actions">
          <Link to="/login">Login</Link>
          <Link to="/register" className="biz-nav-cta">Start free</Link>
        </div>
      </nav>

      <main>
        <section className="biz-hero">
          <div>
            <div className="biz-eyebrow"><SparklesIcon /> Meta-ready WhatsApp platform</div>
            <h1>Automate WhatsApp conversations, campaigns, and customer follow-ups for any business.</h1>
            <p>
              WaAuto helps businesses capture leads, reply faster, send approved templates,
              build WhatsApp flows, and manage customer conversations from one professional dashboard.
            </p>
            <div className="biz-actions">
              <Link to="/register" className="biz-primary">Create account <ArrowRightIcon /></Link>
              <Link to="/login" className="biz-secondary">Open dashboard</Link>
            </div>
            <div className="biz-checks">
              <span><CheckCircleIcon /> Cloud API support</span>
              <span><CheckCircleIcon /> Live WhatsApp previews</span>
              <span><CheckCircleIcon /> Broadcast and automation</span>
            </div>
            <div className="biz-usecases">
              <strong>Built for</strong>
              {useCases.map((item) => <span key={item}>{item}</span>)}
            </div>
            <div className="biz-proof">
              <ShieldCheckIcon />
              <div>
                <b>Designed around Meta WhatsApp rules</b>
                <span>Manage templates, webhooks, phone numbers, flows, opt-ins, and customer replies with a business-ready workflow.</span>
              </div>
            </div>
          </div>

          <div className="biz-preview" aria-label="WhatsApp automation preview">
            <div className="biz-phone">
              <div className="biz-notch" />
              <div className="biz-phone-top">
                <span>W</span>
                <div><b>Brand Support</b><small>online now</small></div>
              </div>
              <div className="biz-chat">
                <div className="biz-day">Today</div>
                <div className="biz-bubble">Welcome to GreenMart. How can we help you today?</div>
                <div className="biz-chat-actions">
                  <button>Product inquiry</button>
                  <button>Book appointment</button>
                  <button>Talk to support</button>
                </div>
                <div className="biz-bubble user">pricing details</div>
                <div className="biz-bubble">Sure. I can share plans, offers, and connect you with our team.</div>
              </div>
              <div className="biz-compose"><span>Type a message</span><b>Send</b></div>
            </div>
            <div className="biz-panel">
              <div><ClipboardDocumentListIcon /><span>Template approved</span></div>
              <div><BoltIcon /><span>Intent matched: pricing</span></div>
              <div><MegaphoneIcon /><span>Campaign ready</span></div>
            </div>
          </div>
        </section>

        <section className="biz-stats">
          <div><b>24/7</b><span>automated customer replies</span></div>
          <div><b>Meta</b><span>template and Cloud API workflow</span></div>
          <div><b>Live</b><span>mobile preview before publishing</span></div>
        </section>

        <section id="platform" className="biz-section">
          <div className="biz-section-head">
            <span className="biz-section-kicker">Platform</span>
            <h2>One workspace for leads, broadcasts, templates, flows, and chatbot automation.</h2>
          </div>
          <div className="biz-module-grid">
            {modules.map((module) => {
              const Icon = module.icon;
              return (
                <article key={module.title}>
                  <Icon />
                  <h3>{module.title}</h3>
                  <p>{module.text}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section id="workflow" className="biz-workflow">
          <div>
            <span className="biz-section-kicker">Workflow</span>
            <h2>From WhatsApp setup to customer conversion without switching tools.</h2>
            <p>Keep setup, templates, flow forms, contacts, broadcasts, and chatbot testing in one business dashboard.</p>
          </div>
          <ol>
            {workflow.map((item, index) => (
              <li key={item}>
                <b>{String(index + 1).padStart(2, '0')}</b>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </section>

        <section id="features" className="biz-feature-grid">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <article key={feature.title}>
                <Icon />
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            );
          })}
        </section>

        <section className="biz-final">
          <div>
            <span className="biz-section-kicker">Ready for WhatsApp-first growth</span>
            <h2>Launch a professional automation dashboard for your business today.</h2>
          </div>
          <Link to="/register" className="biz-primary">Start building <ArrowRightIcon /></Link>
        </section>
      </main>
    </div>
  );
}
