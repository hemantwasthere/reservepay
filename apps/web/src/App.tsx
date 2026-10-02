import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KeyboardShortcuts } from "./lib/KeyboardShortcuts";
import { useToast } from "./lib/Toast";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  CircleDollarSign,
  Code2,
  ExternalLink,
  Github,
  LockKeyhole,
  LoaderCircle,
  Menu,
  RotateCcw,
  Pause,
  Play,
  ShieldCheck,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { calculateSettlement, formatUsdc } from "@reservepay/core/settlement";

import { ConvexError } from "convex/values";
import { useDemoStore, type DemoOrder } from "./lib/demo-store";
import { PaymentHistory } from "./lib/PaymentHistory";
import { useScrollReveal } from "./lib/use-scroll-reveal";

type DemoState = "ready" | "paid" | "completed" | "refunded";
const sourceUrl = "https://github.com/hemantwasthere/reservepay";

function Logo() {
  return (
    <a
      className={
        "brand inline-flex items-center text-[22px] tracking-[-1px] font-[650] whitespace-nowrap max-[900px]:text-[20px] max-[700px]:text-[20px] [@media((hover:_hover)_and_(pointer:_fine))]:[&:hover_.brand-mark_span]:[transform:skewY(-12deg)_scaleX(0.94)] [@media((hover:_hover)_and_(pointer:_fine))]:[&:hover_.brand-mark_span]:rounded-[1.5px] [@media((hover:_hover)_and_(pointer:_fine))]:[&:hover_.brand-mark_span:first-child]:[transform:skewY(-12deg)_translateY(-1px)_scaleX(0.94)] [@media((hover:_hover)_and_(pointer:_fine))]:[&:hover_.brand-mark_span:last-child]:[transform:skewY(-12deg)_translateY(1px)_scaleX(0.94)] motion-reduce:[&:hover_.brand-mark_span]:[transform:skewY(-24deg)]"
      }
      href="#top"
      aria-label="ReservePay home"
    >
      <span
        className={
          "brand-mark relative w-[25px] h-[28px] block mr-[10px] [&_span]:absolute [&_span]:left-[1px] [&_span]:w-[22px] [&_span]:h-[6px] [&_span]:bg-primary [&_span]:[transform:skewY(-24deg)] [&_span]:rounded-[1px] [&_span]:[transition:transform_420ms_var(--ease-settle),_border-radius_420ms_ease] [&_span:nth-child(1)]:top-[4px] [&_span:nth-child(2)]:top-[12px] [&_span:nth-child(3)]:top-[20px] max-[700px]:w-[22px] max-[700px]:mr-[7px] max-[700px]:[&_span]:w-[20px]"
        }
        aria-hidden="true"
      >
        <span />
        <span />
        <span />
      </span>
      ReservePay<span className={"brand-period text-primary"}>.</span>
    </a>
  );
}

function SectionLabel({
  number,
  children,
}: {
  number: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        "section-label flex items-center gap-[13px] [font:9px_var(--mono)] tracking-[1.3px] text-muted-foreground [&>span]:text-muted-foreground max-[700px]:text-[8px] max-[700px]:tracking-[0.8px] max-[700px]:gap-[9px]"
      }
    >
      <span>[ {number} ]</span>
      {children}
    </div>
  );
}

function AppHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header
      className={
        "site-header h-[86px] flex items-center justify-between py-0 px-[40px] [border-bottom:1px_solid_var(--line)] relative z-[5] max-[1100px]:py-0 max-[1100px]:px-[28px] max-[700px]:h-[72px] max-[700px]:py-0 max-[700px]:px-[20px] max-[380px]:py-0 max-[380px]:px-[12px]"
      }
      onKeyDown={(event) => {
        if (event.key === "Escape" && menuOpen) {
          setMenuOpen(false);
          event.currentTarget
            .querySelector<HTMLButtonElement>(".menu-button")
            ?.focus();
        }
      }}
    >
      <Logo />
      <nav
        className={
          menuOpen
            ? 'navigation flex items-center gap-[30px] text-[#62675b] text-[12px] [&_a:hover]:text-primary max-[1100px]:gap-[20px] max-[900px]:gap-[15px] max-[900px]:text-[10px] max-[700px]:hidden max-[700px]:[&.is-open]:flex max-[700px]:[&.is-open]:absolute max-[700px]:[&.is-open]:left-0 max-[700px]:[&.is-open]:right-0 max-[700px]:[&.is-open]:top-[71px] max-[700px]:[&.is-open]:bg-background max-[700px]:[&.is-open]:[border-bottom:1px_solid_var(--line)] max-[700px]:[&.is-open]:p-[22px] max-[700px]:[&.is-open]:flex-col max-[700px]:[&.is-open]:items-start max-[700px]:[&.is-open]:gap-[22px] max-[700px]:[&.is-open]:text-[13px] max-[700px]:[&.is-open]:shadow-[0_10px_20px_#2930250a] max-[700px]:[&.is-open]:animate-[feedback-in_200ms_var(--ease-settle)_both] [&_a]:relative [&_a::after]:[content:""] [&_a::after]:absolute [&_a::after]:left-0 [&_a::after]:right-0 [&_a::after]:bottom-[-5px] [&_a::after]:h-[1px] [&_a::after]:bg-current [&_a::after]:[transform:scaleX(0)] [&_a::after]:[transform-origin:left] [&_a::after]:[transition:transform_250ms_var(--ease-settle)] [&_a:focus-visible::after]:[transform:scaleX(1)] [@media((hover:_hover)_and_(pointer:_fine))]:[&_a:hover::after]:[transform:scaleX(1)] is-open'
            : 'navigation flex items-center gap-[30px] text-[#62675b] text-[12px] [&_a:hover]:text-primary max-[1100px]:gap-[20px] max-[900px]:gap-[15px] max-[900px]:text-[10px] max-[700px]:hidden max-[700px]:[&.is-open]:flex max-[700px]:[&.is-open]:absolute max-[700px]:[&.is-open]:left-0 max-[700px]:[&.is-open]:right-0 max-[700px]:[&.is-open]:top-[71px] max-[700px]:[&.is-open]:bg-background max-[700px]:[&.is-open]:[border-bottom:1px_solid_var(--line)] max-[700px]:[&.is-open]:p-[22px] max-[700px]:[&.is-open]:flex-col max-[700px]:[&.is-open]:items-start max-[700px]:[&.is-open]:gap-[22px] max-[700px]:[&.is-open]:text-[13px] max-[700px]:[&.is-open]:shadow-[0_10px_20px_#2930250a] max-[700px]:[&.is-open]:animate-[feedback-in_200ms_var(--ease-settle)_both] [&_a]:relative [&_a::after]:[content:""] [&_a::after]:absolute [&_a::after]:left-0 [&_a::after]:right-0 [&_a::after]:bottom-[-5px] [&_a::after]:h-[1px] [&_a::after]:bg-current [&_a::after]:[transform:scaleX(0)] [&_a::after]:[transform-origin:left] [&_a::after]:[transition:transform_250ms_var(--ease-settle)] [&_a:focus-visible::after]:[transform:scaleX(1)] [@media((hover:_hover)_and_(pointer:_fine))]:[&_a:hover::after]:[transform:scaleX(1)]'
        }
        id="main-navigation"
        aria-label="Main navigation"
      >
        <a href="#how" onClick={() => setMenuOpen(false)}>
          How it works
        </a>
        <a href="#merchants" onClick={() => setMenuOpen(false)}>
          For merchants
        </a>
        <a href="#protocol" onClick={() => setMenuOpen(false)}>
          Protocol
        </a>
      </nav>
      <div
        className={
          "header-actions flex items-center gap-[22px] max-[900px]:gap-[12px] max-[700px]:gap-[8px]"
        }
      >
        <a
          className={
            "source-link text-[#62675b] [transition:color_180ms_ease,_background-color_180ms_ease,_border-color_180ms_ease,_box-shadow_180ms_ease,_transform_220ms_var(--ease-settle)] max-[700px]:hidden"
          }
          href={sourceUrl}
          target="_blank"
          rel="noreferrer"
          aria-label="View ReservePay on GitHub"
        >
          <Github size={17} />
        </a>
        <Button asChild variant="ink" size="unstyled">
          <a className={"button button-dark"} href="/app">
            Open app <ArrowUpRight size={15} />
          </a>
        </Button>
        <Button
          variant="unstyled"
          size="unstyled"
          className={
            "menu-button hidden [border:0] [background:none] p-[6px] [transition:color_180ms_ease,_background-color_180ms_ease,_border-color_180ms_ease,_box-shadow_180ms_ease,_transform_220ms_var(--ease-settle)] max-[700px]:flex [&:active]:[transform:translateY(1px)_scale(0.985)] motion-reduce:[&:active]:[transform:none]!"
          }
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={menuOpen}
          aria-controls="main-navigation"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </Button>
      </div>
    </header>
  );
}

function ReserveVisual() {
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const visual = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let inView = false;
    const update = () => setVisible(inView && !document.hidden);
    const observer = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        update();
      },
      { threshold: 0.1 },
    );
    if (visual.current) observer.observe(visual.current);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  const [destination, setDestination] = useState<"merchant" | "reserve" | null>(
    null,
  );
  const captionId = useId();
  return (
    <Card
      as="div"
      className={
        'reserve-visual bg-[#f9faf6] [border:1px_solid_#d4dacc] shadow-[0_4px_0_#eff1e9,_0_5px_0_#d4dacc] relative max-[700px]:w-[100%] max-[700px]:max-w-[440px] max-[700px]:[justify-self:center] [&.is-revealed_.payer-node]:animate-[node-confirm-loop_5s_ease_240ms_infinite] [&.is-revealed_.route-packet]:animate-[payment-travel_5s_ease-in-out_infinite] [&.is-revealed_.destination]:animate-[node-confirm-loop_5s_ease_1650ms_infinite] [&.is-revealed_.new-block]:animate-[reserve-deposit_5s_ease_var(--block-delay)_infinite] [&.is-revealed_.coverage-line>svg]:animate-[confirm-in_450ms_var(--ease-settle)_1850ms_both] [&[data-destination="merchant"]_.merchant-packet]:stroke-[#426b36] [&[data-destination="merchant"]_.merchant-packet]:[stroke-width:3] [&[data-destination="reserve"]_.reserve-packet]:stroke-[#426b36] [&[data-destination="reserve"]_.reserve-packet]:[stroke-width:3] [&[data-destination="reserve"]_.reserve-foundation]:bg-[#e9f0e350] [&[data-paused="true"]_.routing-diagram_*]:[animation-play-state:paused]! motion-reduce:[&_.replay-flow]:hidden'
      }
      ref={visual}
      data-paused={paused || !visible}
      data-reveal
      data-destination={destination ?? "all"}
      aria-label="Example: a 100 USDC payment sends 95 USDC to the merchant and 5 USDC to a reserve, backed by existing collateral for full refund coverage."
    >
      <div
        className={
          "visual-meta flex justify-between items-center [font:8px_var(--mono)] tracking-[0.6px] py-[16px] px-[20px] text-muted-foreground [border-bottom:1px_solid_var(--line)] [&_.status-dot]:text-primary max-[900px]:pl-[16px] max-[900px]:pr-[16px] max-[900px]:text-[6px] max-[700px]:text-[8px] max-[700px]:py-[15px] max-[700px]:px-[20px]"
        }
      >
        <span>PAYMENT ROUTING</span>
        <span
          className={
            'status-dot inline-flex items-center gap-[6px] [&::before]:[content:""] [&::before]:w-[5px] [&::before]:h-[5px] [&::before]:bg-[#608a4b] [&::before]:rounded-[50%] [&::before]:inline-block [&::before]:shadow-[0_0_0_3px_#608a4b0c] [&::before]:shrink-[0] [&.neutral::before]:bg-[#8c9185]'
          }
        >
          PROTECTED
        </span>
      </div>
      <div
        className={
          "routing-diagram [padding:25px_24px_0] max-[900px]:[padding:20px_17px_0] max-[700px]:[padding:24px_22px_0]"
        }
      >
        <div
          className={
            "payer-node max-w-[245px] flex items-center gap-[12px] [border:1px_solid_var(--line)] bg-card p-[14px] m-auto [&_div]:grid [&_div]:gap-[6px] [&_div>span]:[font:8px_var(--mono)] [&_div>span]:tracking-[0.6px] [&_div>span]:text-muted-foreground [&_strong]:[font:17px_var(--mono)] [&_strong]:tracking-[-0.5px] [&_small]:text-[9px] [&_small]:text-muted-foreground [&>svg]:ml-auto [&>svg]:text-primary"
          }
        >
          <span
            className={
              "node-icon grid place-items-center w-[33px] h-[33px] bg-[#f0f2eb]"
            }
          >
            <Wallet size={18} />
          </span>
          <div>
            <span>BUYER PAYS</span>
            <strong>
              100.00 <small>USDC</small>
            </strong>
          </div>
          <Check size={16} />
        </div>
        <svg
          className={
            "route-lines block w-[100%] h-[48px] overflow-visible fill-[#658555]"
          }
          viewBox="0 0 400 48"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            className={
              "route-track [fill:none] stroke-[#b8c6ac] [stroke-width:1] [vector-effect:non-scaling-stroke]"
            }
            d="M200 0V24H97V48M200 24H303V48"
          />
          <path
            className={
              "route-packet [fill:none] stroke-[#658555] [stroke-width:2] [stroke-linecap:round] [stroke-dasharray:5_100] [stroke-dashoffset:5] opacity-[0] merchant-packet"
            }
            pathLength="100"
            d="M200 0V24H97V48"
          />
          <path
            className={
              "route-packet [fill:none] stroke-[#658555] [stroke-width:2] [stroke-linecap:round] [stroke-dasharray:5_100] [stroke-dashoffset:5] opacity-[0] reserve-packet"
            }
            pathLength="100"
            d="M200 0V24H303V48"
          />
          <circle cx="97" cy="46" r="2" />
          <circle cx="303" cy="46" r="2" />
        </svg>
        <div
          className={
            "destination-grid grid grid-cols-[1fr_1fr] gap-[14px] max-[900px]:gap-[9px] max-[700px]:gap-[13px]"
          }
        >
          <Button
            variant="unstyled"
            size="unstyled"
            type="button"
            className={
              'destination p-[16px] flex flex-col items-start [border:1px_solid_var(--line)] bg-card text-left min-w-[0] [transition:transform_250ms_var(--ease-settle),_border-color_250ms_ease,_background-color_250ms_ease,_box-shadow_250ms_ease] [&>svg]:text-primary [&>svg]:mb-[14px] [&>span]:[font:7px_var(--mono)] [&>span]:tracking-[0.6px] [&>span]:text-muted-foreground [&>span]:whitespace-nowrap [&>span]:flex [&>span]:items-center [&>span]:gap-[5px] [&>strong]:text-[32px] [&>strong]:tracking-[-1px] [&>strong]:leading-[1.4] [&>strong]:font-[500] [&>strong_span]:text-muted-foreground [&>small]:text-[9px] [&>small]:text-muted-foreground max-[1100px]:p-[13px] max-[1100px]:[&>span]:text-[6px] max-[1100px]:[&>small]:text-[8px] max-[900px]:[&>strong]:text-[27px] max-[700px]:p-[16px] max-[700px]:[&>span]:text-[8px] max-[700px]:[&>strong]:text-[32px] max-[700px]:[&>small]:text-[9px] max-[380px]:p-[12px] max-[380px]:[&>span]:text-[6px] max-[380px]:[&>small]:text-[8px] [&>span>svg]:opacity-[0.5] [&>span>svg]:[transition:opacity_180ms_ease,_transform_220ms_var(--ease-settle)] [&[aria-pressed="true"]]:border-[#88a474] [&[aria-pressed="true"]]:shadow-[inset_0_0_0_1px_#88a47430] [&:active]:[transform:translateY(1px)] [@media((hover:_hover)_and_(pointer:_fine))]:[&:hover]:[transform:translateY(-2px)] [@media((hover:_hover)_and_(pointer:_fine))]:[&:hover]:border-[#9eb48d] [@media((hover:_hover)_and_(pointer:_fine))]:[&:hover>span>svg]:opacity-[1] [@media((hover:_hover)_and_(pointer:_fine))]:[&:hover>span>svg]:[transform:translate(1px,_-1px)] motion-reduce:[&>span>svg]:[transform:none]! motion-reduce:[&:hover]:[transform:none]! motion-reduce:[&:active]:[transform:none]! merchant-destination'
            }
            aria-pressed={destination === "merchant"}
            aria-describedby={captionId}
            onClick={() => setDestination("merchant")}
          >
            <Zap size={17} />
            <span>
              TO THE MERCHANT <ArrowUpRight size={10} />
            </span>
            <strong>
              $95<span>.00</span>
            </strong>
            <small>Available immediately</small>
          </Button>
          <Button
            variant="unstyled"
            size="unstyled"
            type="button"
            className={
              'destination p-[16px] flex flex-col items-start [border:1px_solid_var(--line)] text-left min-w-[0] [transition:transform_250ms_var(--ease-settle),_border-color_250ms_ease,_background-color_250ms_ease,_box-shadow_250ms_ease] [&>svg]:text-primary [&>svg]:mb-[14px] [&>span]:[font:7px_var(--mono)] [&>span]:tracking-[0.6px] [&>span]:text-muted-foreground [&>span]:whitespace-nowrap [&>span]:flex [&>span]:items-center [&>span]:gap-[5px] [&>strong]:text-[32px] [&>strong]:tracking-[-1px] [&>strong]:leading-[1.4] [&>strong]:font-[500] [&>strong_span]:text-muted-foreground [&>small]:text-[9px] [&>small]:text-muted-foreground max-[1100px]:p-[13px] max-[1100px]:[&>span]:text-[6px] max-[1100px]:[&>small]:text-[8px] max-[900px]:[&>strong]:text-[27px] max-[700px]:p-[16px] max-[700px]:[&>span]:text-[8px] max-[700px]:[&>strong]:text-[32px] max-[700px]:[&>small]:text-[9px] max-[380px]:p-[12px] max-[380px]:[&>span]:text-[6px] max-[380px]:[&>small]:text-[8px] [&>span>svg]:opacity-[0.5] [&>span>svg]:[transition:opacity_180ms_ease,_transform_220ms_var(--ease-settle)] [&[aria-pressed="true"]]:border-[#88a474] [&[aria-pressed="true"]]:shadow-[inset_0_0_0_1px_#88a47430] [&:active]:[transform:translateY(1px)] [@media((hover:_hover)_and_(pointer:_fine))]:[&:hover]:[transform:translateY(-2px)] [@media((hover:_hover)_and_(pointer:_fine))]:[&:hover]:border-[#9eb48d] [@media((hover:_hover)_and_(pointer:_fine))]:[&:hover>span>svg]:opacity-[1] [@media((hover:_hover)_and_(pointer:_fine))]:[&:hover>span>svg]:[transform:translate(1px,_-1px)] motion-reduce:[&>span>svg]:[transform:none]! motion-reduce:[&:hover]:[transform:none]! motion-reduce:[&:active]:[transform:none]! reserve-destination bg-[#edf3e5] border-[#cbdabf]'
            }
            aria-pressed={destination === "reserve"}
            aria-describedby={captionId}
            onClick={() => setDestination("reserve")}
          >
            <LockKeyhole size={17} />
            <span>
              TO THE RESERVE <ArrowUpRight size={10} />
            </span>
            <strong>
              $5<span>.00</span>
            </strong>
            <small>Held through protection</small>
          </Button>
        </div>
        <div
          className={
            "reserve-foundation [padding:19px_0_15px] [transition:background-color_250ms_ease]"
          }
        >
          <div
            className={
              "reserve-blocks grid grid-cols-[repeat(24,_1fr)] gap-[3px] [&_span]:aspect-[1] [&_span]:bg-[#dbe4d1] [&_span]:[border:1px_solid_#ced9c2] [&_span]:[transition:transform_220ms_var(--ease-settle),_filter_220ms_ease,_box-shadow_220ms_ease] [&_.new-block]:bg-[#769764] [&_.new-block]:border-[#658a51] max-[900px]:gap-[2px] max-[700px]:gap-[3px] [@media((hover:_hover)_and_(pointer:_fine))]:[&_span:hover]:[transform:translateY(-1.5px)] [@media((hover:_hover)_and_(pointer:_fine))]:[&_span:hover]:[filter:brightness(1.08)] [@media((hover:_hover)_and_(pointer:_fine))]:[&_span:hover]:shadow-[0_2px_3px_#426b3620] motion-reduce:[&_span:hover]:[transform:none]!"
            }
            aria-hidden="true"
          >
            {Array.from({ length: 96 }, (_, i) => (
              <span
                className={i >= 88 ? "new-block" : ""}
                key={i}
                style={
                  {
                    "--block-delay": `${1650 + (i - 88) * 35}ms`,
                  } as React.CSSProperties
                }
              />
            ))}
          </div>
          <div
            className={
              "foundation-label flex justify-between gap-[5px] text-[8px] text-muted-foreground mt-[10px] [&_span]:flex [&_span]:gap-[5px] [&_span]:items-center [&_i]:w-[6px] [&_i]:h-[6px] [&_i]:bg-[#d1ddc6] [&_span:last-child_i]:bg-[#769764] max-[900px]:text-[6px] max-[700px]:text-[8px] max-[380px]:text-[6px]"
            }
          >
            <span>
              <i /> Existing merchant collateral
            </span>
            <span>
              <i /> New reserve
            </span>
          </div>
        </div>
        <div
          className={
            "coverage-line [padding:14px_0_18px] [border-top:1px_dashed_#cbd5c1] flex items-center gap-[8px] text-[#567344] text-[10px] [&_strong]:ml-auto [&_strong]:[font:12px_var(--mono)]"
          }
        >
          <ShieldCheck size={17} />
          <span>Full order coverage</span>
          <strong>100%</strong>
        </div>
      </div>
      <div
        className={
          "flow-caption min-h-[46px] [padding:0_24px_14px] text-muted-foreground text-[10px] leading-[1.6] [&>span]:block [&>span]:animate-[feedback-in_240ms_var(--ease-settle)_both] max-[700px]:pl-[22px] max-[700px]:pr-[22px] max-[700px]:min-h-[62px]"
        }
        id={captionId}
        role="status"
      >
        <span key={destination ?? "all"}>
          {destination === "merchant"
            ? "95 USDC goes straight to the merchant. No waiting for the order to clear."
            : destination === "reserve"
              ? "5 USDC joins the reserve. Existing collateral backs a full 100 USDC refund."
              : "Follow a 100 USDC payment. Select a destination to see how it works."}
        </span>
      </div>
      <div
        className={
          "visual-footer flex justify-between items-center [font:8px_var(--mono)] tracking-[0.6px] text-muted-foreground [border-top:1px_solid_var(--line)] py-[13px] px-[20px] text-[8px] pt-[6px] pb-[6px] [&_span:last-child]:flex [&_span:last-child]:gap-[5px] [&_span:last-child]:items-center max-[900px]:pl-[16px] max-[900px]:pr-[16px] max-[900px]:text-[6px] max-[700px]:text-[6px]"
        }
      >
        <span>ILLUSTRATIVE FLOW</span>
        <Button
          variant="unstyled"
          size="unstyled"
          type="button"
          className={
            "replay-flow [transition:color_180ms_ease,_background-color_180ms_ease,_border-color_180ms_ease,_box-shadow_180ms_ease,_transform_220ms_var(--ease-settle)] inline-flex items-center gap-[6px] min-h-[32px] [border:0] p-0 bg-transparent text-[#637953] [font:inherit] tracking-[inherit] [&:active]:[transform:translateY(1px)_scale(0.985)] [&_svg]:[transition:transform_400ms_var(--ease-settle)] [@media((hover:_hover)_and_(pointer:_fine))]:[&:hover_svg]:[transform:rotate(-35deg)] motion-reduce:[&:active]:[transform:none]! motion-reduce:[&_svg]:[transform:none]!"
          }
          onClick={() => setPaused((value) => !value)}
          aria-label={
            paused
              ? "Resume payment flow animation"
              : "Pause payment flow animation"
          }
        >
          {paused ? <Play size={12} /> : <Pause size={12} />}
          {paused ? "RESUME FLOW" : "PAUSE FLOW"}
        </Button>
      </div>
    </Card>
  );
}

function CheckoutDemo() {
  const { notify } = useToast();
  const [amountInput, setAmountInput] = useState("100");
  const [reserveBps, setReserveBps] = useState(500);
  const store = useDemoStore();
  const [selectedOrder, setSelectedOrder] = useState<DemoOrder | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(crypto.randomUUID());
  const activeOrder =
    store.orders.find((order) => order.id === selectedOrder?.id) ??
    selectedOrder;
  const state: DemoState = activeOrder?.status ?? "ready";
  const inputId = useId();
  const amount = Number(amountInput);
  const valid =
    amountInput.trim() !== "" &&
    Number.isFinite(amount) &&
    amount >= 1 &&
    amount <= 10000 &&
    Math.abs(amount * 100 - Math.round(amount * 100)) < 0.000001;
  const settlement = useMemo(
    () =>
      calculateSettlement(
        BigInt(Math.round((valid ? amount : 100) * 1_000_000)),
        reserveBps,
      ),
    [amount, valid, reserveBps],
  );
  const money = (value: bigint) => `$${formatUsdc(value)}`;
  const finished = state === "completed" || state === "refunded";
  const reset = () => {
    setSelectedOrder(null);
    setError("");
    requestId.current = crypto.randomUUID();
  };
  const selectOrder = (order: DemoOrder) => {
    setAmountInput((Number(order.amount) / 1_000_000).toString());
    setReserveBps(order.reserveBps);
    setSelectedOrder(order);
    setError("");
  };
  const save = async (operation: () => Promise<DemoOrder>) => {
    if (pending || !store.connected) return;
    setPending(true);
    setError("");
    try {
      const order = await operation();
      setSelectedOrder(order);
      notify({
        id: "demo-payment",
        title:
          order.status === "refunded"
            ? "Demo refund complete"
            : order.status === "completed"
              ? "Demo order completed"
              : "Demo payment protected",
        description: "This is a simulation. No wallet funds were moved.",
        tone: "success",
      });
    } catch (cause) {
      const message =
        cause instanceof ConvexError
          ? String(cause.data)
          : "Could not save this demo payment. Please try again.";
      setError(message);
      notify({
        id: "demo-payment",
        title: "Could not save demo payment",
        description: message,
        tone: "error",
      });
    } finally {
      setPending(false);
    }
  };
  const status = {
    ready: "Ready when you are",
    paid: "Payment protected",
    completed: "Order completed",
    refunded: "Buyer refunded",
  }[state];

  return (
    <section
      className={
        'demo-section [padding:72px_64px_40px] bg-[#f0f2eaaa] max-[1100px]:pl-[36px] max-[1100px]:pr-[36px] max-[700px]:py-[48px] max-[700px]:px-[26px] max-[380px]:pl-[20px] max-[380px]:pr-[20px] section-frame relative [border-bottom:1px_solid_var(--line)] [&::before]:[content:"+"] [&::before]:absolute [&::before]:bottom-[-9px] [&::before]:text-[#9ba391] [&::before]:[font:17px_var(--mono)] [&::before]:z-[2] [&::before]:left-[-6px] [&::after]:[content:"+"] [&::after]:absolute [&::after]:bottom-[-9px] [&::after]:text-[#9ba391] [&::after]:[font:17px_var(--mono)] [&::after]:z-[2] [&::after]:right-[-6px]'
      }
      id="demo"
      aria-labelledby="demo-title"
    >
      <div
        className={
          "section-heading flex justify-between items-end gap-[32px] mb-[42px] [&_h2]:mt-[22px] [&>p]:text-muted-foreground [&>p]:text-[13px] [&>p]:max-w-[345px] [&>p]:mb-[4px] max-[900px]:[&>p]:text-[11px] max-[900px]:[&>p]:max-w-[270px] max-[700px]:block max-[700px]:mb-[29px] max-[700px]:[&_h2]:mt-[20px] max-[700px]:[&>p]:mt-[20px] max-[700px]:[&>p]:text-[12px] max-[700px]:[&>p]:max-w-[none] max-[700px]:[&>p_br]:hidden"
        }
        data-reveal
      >
        <div>
          <SectionLabel number="02">TRY IT YOURSELF</SectionLabel>
          <h2 id="demo-title">
            One payment.
            <br />
            <span>Both sides protected.</span>
          </h2>
        </div>
        <p>
          Follow the money from checkout to settlement.
          <br className={"desktop-break"} /> Change the amount. Test a refund.
          See what moves.
        </p>
      </div>
      <Card
        as="div"
        className={
          'demo-workbench grid grid-cols-[0.92fr_1.08fr] [border:1px_solid_#d1d8c7] bg-card shadow-[0_5px_20px_#28351d03] max-[900px]:grid-cols-[1fr_1fr] max-[700px]:grid-cols-[minmax(0,_1fr)] [&_.split-bar]:overflow-hidden [&_.split-bar_span]:relative [&_.split-bar_span]:overflow-hidden [&_.split-bar_span]:[transition:flex_480ms_var(--ease-settle),_background-color_300ms_ease] [&[data-state="paid"]_.split-bar_span::after]:[content:""] [&[data-state="paid"]_.split-bar_span::after]:absolute [&[data-state="paid"]_.split-bar_span::after]:inset-0 [&[data-state="paid"]_.split-bar_span::after]:[background:linear-gradient(90deg,_transparent,_#ffffff65,_transparent)] [&[data-state="paid"]_.split-bar_span::after]:animate-[settlement-sweep_800ms_ease-out]'
        }
        data-reveal
        data-state={state}
      >
        <div
          className={
            "checkout-panel [border-right:1px_solid_var(--line)] max-[700px]:[border-right:0] max-[700px]:[border-bottom:1px_solid_var(--line)]"
          }
        >
          <div
            className={
              "panel-topline min-h-[49px] flex items-center justify-between gap-[10px] py-0 px-[24px] [border-bottom:1px_solid_var(--line)] [font:8px_var(--mono)] tracking-[0.9px] text-muted-foreground [&>span]:flex [&>span]:items-center [&>span]:gap-[8px] max-[700px]:py-0 max-[700px]:px-[23px]"
            }
          >
            <span>
              <span className={"tiny-square w-[6px] h-[6px] bg-primary"} />{" "}
              CHECKOUT
            </span>
            <span
              className={
                "demo-badge [font:7px_var(--mono)] tracking-[1px] bg-[#edf0e7] [border:1px_solid_#dce2d3] text-muted-foreground py-[4px] px-[6px]"
              }
            >
              SIMULATION
            </span>
          </div>
          <div
            className={
              "checkout-content p-[31px] max-[1100px]:p-[26px] max-[900px]:py-[22px] max-[900px]:px-[18px] max-[700px]:py-[26px] max-[700px]:px-[23px] max-[380px]:py-[23px] max-[380px]:px-[16px]"
            }
          >
            <div
              className={
                "product-row flex items-center gap-[15px] mb-[32px] [&_h3]:text-[15px] [&_h3]:tracking-[-0.3px] [&_h3]:my-[5px] [&_h3]:mx-0 [&_p]:text-[10px] [&_p]:text-muted-foreground max-[900px]:gap-[10px] max-[900px]:[&_h3]:text-[13px] max-[900px]:[&_p]:text-[9px] max-[700px]:[&_h3]:text-[15px] max-[700px]:[&_p]:text-[10px] max-[700px]:gap-[14px] max-[380px]:gap-[10px] max-[380px]:[&_p]:text-[8px] [@media((hover:_hover)_and_(pointer:_fine))]:[&:hover_.product-art>i]:[transform:rotate(50deg)] motion-reduce:[&:hover_.product-art>i]:[transform:rotate(40deg)]"
              }
            >
              <div
                className={
                  "product-art relative w-[51px] h-[58px] bg-[#e0e8d7] grid place-items-center overflow-hidden shrink-[0] [&>span]:[font:italic_37px_Georgia] [&>span]:text-[#526c40] [&>span]:[transform:rotate(-9deg)] [&>span]:z-[1] [&_i]:absolute [&_i]:w-[47px] [&_i]:h-[70px] [&_i]:[border:1px_solid_#b7c7a6] [&_i]:[transform:rotate(40deg)] max-[900px]:w-[41px] max-[900px]:h-[48px] max-[700px]:w-[47px] max-[700px]:h-[54px] [&>i]:[transition:transform_600ms_var(--ease-settle)]"
                }
                aria-hidden="true"
              >
                <span>N</span>
                <i />
              </div>
              <div>
                <span
                  className={
                    "muted-label [font:7px_var(--mono)] text-muted-foreground tracking-[1px]"
                  }
                >
                  NORTHSTAR STUDIO
                </span>
                <h3>Creator Launch Kit</h3>
                <p>Digital assets. Ready for your next idea.</p>
              </div>
            </div>
            <label
              className={
                "amount-label flex items-center justify-between text-[11px] mb-[11px] text-muted-foreground [&_span]:[font:7px_var(--mono)] [&_span]:tracking-[0.7px] [&_span]:text-muted-foreground"
              }
              htmlFor={inputId}
            >
              Order total <span>USDC ON SOLANA</span>
            </label>
            <div
              className={`amount-input [&_input]:text-[34px] [&_input]:tracking-[-1.5px] [&_input]:font-[500] [&_input]:[background:none] [&_input]:[border:0] [&_input]:[outline:none] [&_input]:w-[100%] [&_input]:min-w-[0] [&_input]:text-foreground [&_input]:p-0 [&_input]:[appearance:textfield] [&_input]:[-moz-appearance:textfield] [&_input::-webkit-inner-spin-button]:[-webkit-appearance:none] [&_input::-webkit-inner-spin-button]:m-0 [&_input::-webkit-outer-spin-button]:[-webkit-appearance:none] [&_input::-webkit-outer-spin-button]:m-0 flex items-center gap-[7px] py-[13px] px-[15px] [border:1px_solid_#dce2d3] bg-[#f8faf4] [&>span]:text-[30px] [&>span]:text-[#a0aa95] [&>span]:font-[400] [&:focus-within]:border-[#64874d] [&_svg]:text-[#668eaa] [&_svg]:shrink-[0] [&.has-error]:border-[#a55745] ${!valid ? "has-error" : ""}`}
            >
              <span>$</span>
              <Input
                variant="embedded"
                id={inputId}
                aria-label="Order amount"
                aria-invalid={!valid}
                aria-describedby={!valid ? `${inputId}-error` : undefined}
                type="number"
                min="1"
                max="10000"
                step="0.01"
                disabled={pending}
                value={amountInput}
                onChange={(event) => {
                  setAmountInput(event.target.value);
                  reset();
                }}
              />
              <CircleDollarSign size={22} />
            </div>
            {!valid && (
              <p
                className={"input-error text-[10px] text-[#9d4734] mt-[6px]"}
                id={`${inputId}-error`}
              >
                Enter $1–$10,000 with up to two decimal places.
              </p>
            )}
            <div
              className={
                "protection-note flex items-center gap-[11px] my-[23px] mx-0 text-[#678256] [&>svg]:shrink-[0] [&>svg:last-child]:ml-auto [&_div]:grid [&_div]:gap-[5px] [&_strong]:text-[11px] [&_strong]:font-[500] [&_strong]:text-[#506444] [&_span]:text-[9px] [&_span]:text-[#657653] max-[900px]:gap-[7px] max-[900px]:[&_strong]:text-[10px] max-[900px]:[&_span]:text-[8px] max-[700px]:gap-[10px] max-[700px]:[&_strong]:text-[11px] max-[700px]:[&_span]:text-[9px] max-[380px]:[&_span]:text-[8px]"
              }
            >
              <ShieldCheck size={19} />
              <div>
                <strong>7 days of buyer protection</strong>
                <span>Full refund if the product isn’t delivered.</span>
              </div>
              <Check size={15} />
            </div>
            <div className={"checkout-action"} aria-live="polite">
              {state === "ready" ? (
                <Button
                  variant="brand"
                  size="unstyled"
                  className={
                    'button button-green pay-button w-[100%] justify-between text-[12px] [&[aria-busy="true"]]:opacity-[0.8]'
                  }
                  aria-busy={pending}
                  disabled={!valid || pending || !store.connected}
                  onClick={() =>
                    void save(() =>
                      store.create({
                        amountCents: Math.round(amount * 100),
                        reserveBps,
                        requestId: requestId.current,
                      }),
                    )
                  }
                >
                  {pending ? (
                    "Saving payment…"
                  ) : (
                    <>Simulate payment {valid && money(settlement.amount)}</>
                  )}
                  {pending ? (
                    <LoaderCircle
                      size={17}
                      className={
                        "pending-spinner animate-[pending-turn_900ms_linear_infinite]"
                      }
                    />
                  ) : (
                    <ArrowRight size={17} />
                  )}
                </Button>
              ) : (
                <div
                  className={`payment-status min-h-[46px] flex items-center gap-[9px] py-0 px-[13px] bg-[#e7efdd] [border:1px_solid_#ccdcbe] text-primary text-[12px] animate-[feedback-in_300ms_var(--ease-settle)_both] [&_.icon-button]:ml-auto [&.refunded]:[color:var(--info)] [&.refunded]:[background:var(--info-soft)] [&.refunded]:border-[#cedce5] [&>svg]:animate-[confirm-in_350ms_var(--ease-settle)_both] [&>svg_polyline]:[stroke-dasharray:40] [&>svg_polyline]:animate-[check-draw_420ms_ease-out_both] [&>svg_path]:[stroke-dasharray:40] [&>svg_path]:animate-[check-draw_420ms_ease-out_both] ${state}`}
                  key={state}
                >
                  <CheckCheck size={19} />
                  <span>{status}</span>
                  <Button
                    variant="unstyled"
                    size="unstyled"
                    className={
                      "icon-button [border:0] [background:none] p-[5px] text-inherit [transition:color_180ms_ease,_background-color_180ms_ease,_border-color_180ms_ease,_box-shadow_180ms_ease,_transform_220ms_var(--ease-settle)] [&:not(:disabled):active]:[transform:translateY(1px)_scale(0.985)] [@media((hover:_hover)_and_(pointer:_fine))]:[&:not(:disabled):hover_svg]:[transform:rotate(-35deg)] motion-reduce:[&:active]:[transform:none]! motion-reduce:[&_svg]:[transform:none]!"
                    }
                    aria-label="Reset demo"
                    disabled={pending}
                    onClick={reset}
                  >
                    <RotateCcw size={16} />
                  </Button>
                </div>
              )}
            </div>
            {error && (
              <p role="alert" className={"mt-3 text-xs text-red-800"}>
                {error}
              </p>
            )}
            {!store.connected && (
              <p role="status" className={"mt-3 text-xs text-muted-foreground"}>
                Reconnecting to saved payments. Please wait before continuing.
              </p>
            )}
            {pending && state !== "ready" && (
              <p role="status" className={"mt-3 text-xs text-muted-foreground"}>
                Saving resolution…
              </p>
            )}
            <p
              className={
                "demo-disclaimer flex items-center justify-center gap-[6px] text-[9px] text-[#69765d] mt-[14px]"
              }
            >
              <LockKeyhole size={11} /> Interactive demo. No real funds move.
            </p>
          </div>
        </div>
        <div className={"settlement-panel bg-[#f8faf4]"}>
          <div
            className={
              "panel-topline min-h-[49px] flex items-center justify-between gap-[10px] py-0 px-[24px] [border-bottom:1px_solid_var(--line)] [font:8px_var(--mono)] tracking-[0.9px] text-muted-foreground [&>span]:flex [&>span]:items-center [&>span]:gap-[8px] max-[700px]:py-0 max-[700px]:px-[23px]"
            }
          >
            <span>BEHIND THE PAYMENT</span>
            <span
              className={`status-dot inline-flex items-center gap-[6px] [&::before]:[content:""] [&::before]:w-[5px] [&::before]:h-[5px] [&::before]:bg-[#608a4b] [&::before]:rounded-[50%] [&::before]:inline-block [&::before]:shadow-[0_0_0_3px_#608a4b0c] [&::before]:shrink-[0] [&.neutral::before]:bg-[#8c9185] ${state === "ready" ? "neutral" : ""}`}
            >
              {state === "ready" ? "PREVIEW" : "SIMULATED"}
            </span>
          </div>
          <div
            className={
              "settlement-content [padding:30px_31px_24px] max-[1100px]:p-[26px] max-[900px]:py-[22px] max-[900px]:px-[18px] max-[700px]:py-[26px] max-[700px]:px-[23px] max-[380px]:py-[23px] max-[380px]:px-[16px]"
            }
          >
            <div
              className={
                "settlement-heading [&_h3]:text-[17px] [&_h3]:tracking-[-0.5px] [&_p]:text-[10px] [&_p]:text-[#657456] [&_p]:mt-[8px] max-[900px]:[&_h3]:text-[15px] max-[700px]:[&_h3]:text-[17px] max-[700px]:[&_p]:text-[11px] animate-[feedback-in_300ms_var(--ease-settle)_both]"
              }
              key={state}
            >
              <h3>
                {state === "refunded"
                  ? "A full refund. As promised."
                  : state === "completed"
                    ? "Delivered. Settled. Done."
                    : "Your money, accounted for."}
              </h3>
              <p>
                {state === "refunded"
                  ? "The merchant reserve returns the entire payment."
                  : state === "completed"
                    ? "The retained reserve is released to the merchant."
                    : "Most goes straight to the merchant. A little stays back."}
              </p>
            </div>
            <div
              className={
                "split-bar flex gap-[4px] h-[8px] [margin:26px_0_23px] [&_span]:[transition:flex_0.3s] [&_span]:min-w-[0] [&_span:first-child]:bg-[#779d5b] [&_span:last-child]:bg-[#c7d7b5]"
              }
              aria-hidden="true"
            >
              <span
                style={{
                  flex:
                    state === "refunded"
                      ? 0
                      : state === "completed"
                        ? 100
                        : 100 - reserveBps / 100,
                }}
              />
              <span
                style={{
                  flex:
                    state === "refunded"
                      ? 100
                      : state === "completed"
                        ? 0
                        : reserveBps / 100,
                }}
              />
            </div>
            <dl
              className={
                "settlement-values grid grid-cols-[1fr_1fr] gap-[20px] m-0 [&_dt]:text-[9px] [&_dt]:text-muted-foreground [&_dt]:flex [&_dt]:items-center [&_dt]:gap-[6px] [&_dd]:text-[27px] [&_dd]:tracking-[-1px] [&_dd]:[margin:10px_0_0] [&_dd]:flex [&_dd]:items-baseline [&_dd]:gap-[6px] [&_dd]:flex-wrap [&_dd_small]:[font:8px_var(--mono)] [&_dd_small]:tracking-[0] [&_dd_small]:text-muted-foreground max-[900px]:[&_dd]:text-[23px] max-[700px]:[&_dd]:text-[28px]"
              }
            >
              <div>
                <dt>
                  <i
                    className={
                      "legend-dot w-[5px] h-[5px] inline-block merchant-dot bg-[#779d5b]"
                    }
                  />
                  {state === "refunded"
                    ? "Returned to buyer"
                    : "Merchant receives"}
                </dt>
                <dd>
                  <span
                    className={
                      "settlement-number inline-block tabular-nums animate-[amount-update_220ms_var(--ease-settle)_both]"
                    }
                    key={`${amount}-${reserveBps}-${state}`}
                  >
                    {valid
                      ? money(
                          state === "refunded" || state === "completed"
                            ? settlement.amount
                            : settlement.merchantAmount,
                        )
                      : "—"}
                  </span>
                  <small>USDC</small>
                </dd>
              </div>
              <div>
                <dt>
                  <i
                    className={
                      "legend-dot w-[5px] h-[5px] inline-block reserve-dot bg-[#c7d7b5]"
                    }
                  />
                  {state === "refunded"
                    ? "Retained from this payment"
                    : "Held in reserve"}
                </dt>
                <dd>
                  <span
                    className={
                      "settlement-number inline-block tabular-nums animate-[amount-update_220ms_var(--ease-settle)_both]"
                    }
                    key={`${amount}-${reserveBps}-${state}`}
                  >
                    {valid
                      ? money(finished ? 0n : settlement.reserveAmount)
                      : "—"}
                  </span>
                  <small>USDC</small>
                </dd>
              </div>
            </dl>
            <div
              className={
                "rate-control mt-[26px] [&_label]:flex [&_label]:justify-between [&_label]:items-center [&_label]:text-[10px] [&_label]:text-muted-foreground [&_strong]:[font:11px_var(--mono)] [&_strong]:text-[#536443] [&>div]:flex [&>div]:justify-between [&>div]:[font:7px_var(--mono)] [&>div]:text-muted-foreground [&>div]:tracking-[0.3px] max-[700px]:[&_label]:text-[11px]"
              }
            >
              <label htmlFor={`${inputId}-rate`}>
                Merchant reserve rate <strong>{reserveBps / 100}%</strong>
              </label>
              <Slider
                id={`${inputId}-rate`}
                aria-label="Reserve rate"
                min={100}
                max={1000}
                step={100}
                disabled={pending}
                value={[reserveBps]}
                onValueChange={([value]) => {
                  setReserveBps(value);
                  reset();
                }}
                className="my-5"
              />
              <div>
                <span>1% · LOWER RESERVE</span>
                <span>10% · HIGHER RESERVE</span>
              </div>
            </div>
            <div
              className={
                "coverage-note flex items-start gap-[10px] [border-top:1px_dashed_#d3ddc8] pt-[20px] mt-[23px] text-[#627751] [&_svg]:shrink-[0] [&_svg]:mt-[3px] [&_p]:text-[10px] [&_p]:leading-[1.7] [&_strong]:text-[#626f56] [&_strong]:font-[500] max-[700px]:[&_p]:text-[11px]"
              }
            >
              <ShieldCheck size={17} />
              <p>
                <strong>
                  {finished
                    ? "Protection resolved."
                    : `${reserveBps / 100}% retained doesn’t mean ${reserveBps / 100}% protected.`}
                </strong>{" "}
                {finished
                  ? state === "refunded"
                    ? "Existing merchant collateral covers the rest of the refund."
                    : "This order no longer locks merchant collateral."
                  : "Existing merchant collateral backs the rest. Every open order is fully covered."}
              </p>
            </div>
            <div
              className={
                "resolution-actions flex items-center justify-between gap-[12px] min-h-[39px] mt-[16px] [&>span]:flex [&>span]:items-center [&>span]:gap-[8px] [&>span]:text-[9px] [&>span]:text-muted-foreground [&_.button]:min-h-[34px] [&_.button]:text-[10px] [&_.button]:py-0 [&_.button]:px-[12px] [&_.button]:gap-[6px] [&_.text-button]:text-[10px] [&_.text-button]:gap-[6px] max-[900px]:flex-wrap max-[700px]:min-h-[32px]"
              }
            >
              {state === "paid" ? (
                <>
                  <Button
                    variant="quiet"
                    size="unstyled"
                    className={"button button-outline"}
                    disabled={pending || !store.connected}
                    onClick={() =>
                      activeOrder &&
                      void save(() =>
                        store.resolve(activeOrder.id, "completed"),
                      )
                    }
                  >
                    <Check size={15} /> Complete order
                  </Button>
                  <Button
                    variant="unstyled"
                    size="unstyled"
                    className={
                      "text-button inline-flex items-center gap-[9px] text-[13px] font-[500] [background:none] [border:0] p-0 cursor-pointer [transition:color_180ms_ease,_background-color_180ms_ease,_border-color_180ms_ease,_box-shadow_180ms_ease,_transform_220ms_var(--ease-settle)] [&:hover]:text-primary [&>svg]:[transition:transform_280ms_var(--ease-settle)] [@media((hover:_hover)_and_(pointer:_fine))]:[&:not(:disabled):hover>svg:last-child:not(.left-hint)]:[transform:translateX(3px)] motion-reduce:[&>svg]:[transform:none]!"
                    }
                    disabled={pending || !store.connected}
                    onClick={() =>
                      activeOrder &&
                      void save(() => store.resolve(activeOrder.id, "refunded"))
                    }
                  >
                    <RotateCcw size={14} /> Issue full refund
                  </Button>
                </>
              ) : finished ? (
                <Button
                  variant="unstyled"
                  size="unstyled"
                  className={
                    "text-button inline-flex items-center gap-[9px] text-[13px] font-[500] [background:none] [border:0] p-0 cursor-pointer [transition:color_180ms_ease,_background-color_180ms_ease,_border-color_180ms_ease,_box-shadow_180ms_ease,_transform_220ms_var(--ease-settle)] [&:hover]:text-primary [&>svg]:[transition:transform_280ms_var(--ease-settle)] [@media((hover:_hover)_and_(pointer:_fine))]:[&:not(:disabled):hover>svg:last-child:not(.left-hint)]:[transform:translateX(3px)] motion-reduce:[&>svg]:[transform:none]!"
                  }
                  onClick={reset}
                >
                  <RotateCcw size={14} /> Try another payment
                </Button>
              ) : (
                <span>
                  <ArrowLeftHint /> Simulate a payment to explore what happens
                  next.
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>
      <div
        className={
          "workbench-footer flex items-center justify-between gap-[16px] mt-[17px] text-muted-foreground text-[9px] [&_span:first-child]:flex [&_span:first-child]:items-center [&_span:first-child]:gap-[7px] [&_span:last-child]:[font:7px_var(--mono)] [&_span:last-child]:tracking-[1px] max-[900px]:[&_span:last-child]:text-[6px] max-[700px]:text-[8px] max-[700px]:mt-[16px] max-[700px]:[&_span:last-child]:hidden"
        }
      >
        <span>
          <Code2 size={13} /> Powered by the ReservePay settlement SDK
        </span>
        <span>ONE PAYMENT. A CLEAR PAPER TRAIL.</span>
      </div>
      <PaymentHistory onSelect={selectOrder} disabled={pending} />
    </section>
  );
}

function ArrowLeftHint() {
  return (
    <ArrowRight size={14} className={"left-hint [transform:rotate(180deg)]"} />
  );
}

const steps = [
  {
    icon: Wallet,
    title: "Pay in USDC.",
    text: "A familiar checkout, with a wallet instead of a card. The order’s protection starts here.",
    tag: "BUYER → PAYMENT",
  },
  {
    icon: Zap,
    title: "Keep business moving.",
    text: "Most of the payment goes straight to the merchant. No waiting for the entire order to clear.",
    tag: "PAYMENT → MERCHANT",
  },
  {
    icon: ShieldCheck,
    title: "Let the reserve back it.",
    text: "A small portion joins the merchant’s collateral, with full coverage for every open order.",
    tag: "RESERVE → PROTECTION",
  },
  {
    icon: CheckCheck,
    title: "Deliver. Or make it right.",
    text: "Complete the order to release its reserve. If delivery fails, the resolver can refund the buyer in full.",
    tag: "ORDER → RESOLUTION",
  },
];

const questions = [
  [
    "How can a 5% reserve cover a 100% refund?",
    "Merchants fund collateral before accepting protected payments. The retained portion of each payment adds to that pool. ReservePay checks that the pool can cover every open order in full, and blocks withdrawals that would leave orders undercollateralized.",
  ],
  [
    "Who can issue a refund?",
    "The protocol’s designated resolver can issue a refund from the merchant reserve. Buyers do not automatically receive a refund just by requesting one; the resolver handles the order’s resolution.",
  ],
  [
    "When can merchants withdraw their reserve?",
    "Merchants can withdraw collateral that is not backing open orders. Completing an order releases its locked liability, so more of the reserve can become available.",
  ],
  [
    "Can I use ReservePay for real payments today?",
    "Not yet. This checkout is an interactive simulation and does not submit payment transactions. The merchant dashboard is live on Solana devnet for wallet-signed registration, reserve deposits, and withdrawals. Buyer checkout is still in development.",
  ],
];

export function App() {
  const motionRoot = useScrollReveal();
  return (
    <div id="top" ref={motionRoot}>
      <a
        href="#main"
        className={
          "skip-link [clip-path:inset(50%)] fixed left-[16px] top-[-60px] z-[10] bg-foreground text-white p-[12px] [&:focus]:[clip-path:none] [&:focus]:top-[12px]"
        }
      >
        Skip to content
      </a>
      <div
        className={
          "page-shell w-[calc(100%_-_32px)] max-w-[1280px] m-auto [border-left:1px_solid_var(--line)] [border-right:1px_solid_var(--line)] min-[1440px]:my-0 min-[1440px]:mx-auto max-[700px]:w-[auto] max-[700px]:my-0 max-[700px]:mx-[15px] max-[380px]:my-0 max-[380px]:mx-[9px]"
        }
      >
        <AppHeader />
        <main id="main" tabIndex={-1}>
          <section
            className={
              'hero [padding:96px_64px_83px] grid grid-cols-[1.12fr_1fr] gap-[50px] items-center bg-[linear-gradient(#dce0d532_1px,_transparent_1px),_linear-gradient(90deg,_#dce0d532_1px,_transparent_1px)] bg-size-[64px_64px] [&_h1]:text-[clamp(48px,_5.3vw,_73px)] [&_h1]:font-[500] [&_h1]:tracking-[-4.4px] [&_h1]:leading-[1.07] [&_h1]:[margin:28px_0_25px] [&_h1]:whitespace-nowrap [&_h1_em]:text-primary [&_h1_em]:tracking-[-4px] min-[1440px]:pt-[110px] min-[1440px]:pb-[97px] max-[1100px]:[padding:76px_36px_78px] max-[1100px]:gap-[30px] max-[1100px]:[&_h1]:text-[60px] max-[1100px]:[&_h1]:tracking-[-3.7px] max-[900px]:gap-[25px] max-[900px]:[&_h1]:text-[49px] max-[900px]:[&_h1]:tracking-[-3px] max-[900px]:[&_h1_em]:tracking-[-3px] max-[700px]:grid-cols-[minmax(0,_1fr)] max-[700px]:[padding:56px_27px_60px] max-[700px]:gap-[40px] max-[700px]:[&_h1]:text-[clamp(39px,_8.8vw,_60px)] max-[700px]:[&_h1]:tracking-[-2.7px] max-[700px]:[&_h1]:leading-[1.08] max-[700px]:[&_h1]:[margin:24px_0_21px] max-[700px]:[&_h1_em]:tracking-[-2.7px] max-[380px]:pl-[20px] max-[380px]:pr-[20px] max-[380px]:[&_h1]:text-[34px] max-[380px]:[&_h1]:tracking-[-2.4px] section-frame relative [border-bottom:1px_solid_var(--line)] [&::before]:[content:"+"] [&::before]:absolute [&::before]:bottom-[-9px] [&::before]:text-[#9ba391] [&::before]:[font:17px_var(--mono)] [&::before]:z-[2] [&::before]:left-[-6px] [&::after]:[content:"+"] [&::after]:absolute [&::after]:bottom-[-9px] [&::after]:text-[#9ba391] [&::after]:[font:17px_var(--mono)] [&::after]:z-[2] [&::after]:right-[-6px]'
            }
          >
            <div className={"hero-copy"} data-reveal-stagger>
              <a
                className={
                  "hero-kicker inline-flex items-center gap-[9px] [font:9px_var(--mono)] tracking-[1.1px] max-[1100px]:text-[8px] max-[1100px]:tracking-[0.6px] max-[900px]:text-[8px] max-[700px]:text-[8px] max-[700px]:tracking-[0.7px] max-[700px]:gap-[7px] max-[380px]:text-[6px]"
                }
                href="#protocol"
              >
                <span
                  className={
                    'status-dot inline-flex items-center gap-[6px] [&::before]:[content:""] [&::before]:w-[5px] [&::before]:h-[5px] [&::before]:bg-[#608a4b] [&::before]:rounded-[50%] [&::before]:inline-block [&::before]:shadow-[0_0_0_3px_#608a4b0c] [&::before]:shrink-[0] [&.neutral::before]:bg-[#8c9185]'
                  }
                />{" "}
                THE TRUST LAYER FOR STABLECOINS <ArrowUpRight size={13} />
              </a>
              <h1>
                Good commerce.
                <br />
                Built on <em>trust.</em>
              </h1>
              <p
                className={
                  "hero-lede text-[#646b5c] text-[15px] leading-[1.8] max-[1100px]:text-[13px] max-[900px]:text-[12px] max-[700px]:text-[13px] max-[700px]:max-w-[390px]"
                }
              >
                Get paid now. Keep buyers protected.
                <br />
                Stablecoin payments with a reserve that makes
                <br className={"wide-break max-[900px]:hidden"} /> things right
                when an order goes wrong.
              </p>
              <div
                className={
                  "hero-actions flex items-center gap-[24px] mt-[32px] max-[1100px]:gap-[17px] max-[1100px]:[&_.text-button]:text-[11px] max-[900px]:items-start max-[900px]:flex-col max-[900px]:gap-[18px] max-[700px]:flex-row max-[700px]:items-center max-[700px]:gap-[20px] max-[700px]:mt-[27px] max-[700px]:[&_.button]:text-[11px] max-[700px]:[&_.button]:min-h-[43px] max-[700px]:[&_.button]:py-0 max-[700px]:[&_.button]:px-[15px] max-[700px]:[&_.text-button]:text-[10px] max-[700px]:[&_.text-button]:gap-[6px] max-[700px]:[&_.text-button>svg:first-child]:hidden max-[380px]:gap-[13px] max-[380px]:[&_.text-button]:text-[9px] max-[380px]:[&_.button]:py-0 max-[380px]:[&_.button]:px-[11px]"
                }
              >
                <Button asChild variant="ink" size="unstyled">
                  <a className={"button button-dark"} href="/app">
                    Open app <ArrowUpRight size={16} />
                  </a>
                </Button>
                <Button asChild variant="unstyled" size="unstyled">
                  <a
                    className={
                      "text-button inline-flex items-center gap-[9px] text-[13px] font-[500] [background:none] [border:0] p-0 cursor-pointer [transition:color_180ms_ease,_background-color_180ms_ease,_border-color_180ms_ease,_box-shadow_180ms_ease,_transform_220ms_var(--ease-settle)] [&:hover]:text-primary [&>svg]:[transition:transform_280ms_var(--ease-settle)] [@media((hover:_hover)_and_(pointer:_fine))]:[&:not(:disabled):hover>svg:last-child:not(.left-hint)]:[transform:translateX(3px)] motion-reduce:[&>svg]:[transform:none]!"
                    }
                    href={sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Github size={16} /> Explore the code{" "}
                    <ArrowUpRight size={14} />
                  </a>
                </Button>
              </div>
              <div
                className={
                  "hero-footnote flex items-center gap-[10px] mt-[32px] [font:9px_var(--mono)] tracking-[0.9px] text-muted-foreground max-[900px]:text-[8px] max-[900px]:gap-[7px] max-[700px]:text-[8px] max-[700px]:tracking-[0.7px] max-[700px]:mt-[25px]"
                }
              >
                <span
                  className={
                    "solana-mark w-[14px] grid gap-[2px] [&_i]:h-[3px] [&_i]:bg-[#777e6b] [&_i]:[transform:skew(-27deg)] [&_i:nth-child(2)]:[transform:skew(27deg)]"
                  }
                  aria-hidden="true"
                >
                  <i />
                  <i />
                  <i />
                </span>{" "}
                BUILT ON SOLANA{" "}
                <span className={"divider-slash text-[#c3c8bb] py-0 px-[4px]"}>
                  /
                </span>{" "}
                SETTLED IN USDC
              </div>
            </div>
            <ReserveVisual />
            <div
              className={
                "hero-index absolute bottom-[19px] left-[40px] right-[40px] flex justify-between text-muted-foreground [font:8px_var(--mono)] tracking-[1px] [&_span:last-child]:flex [&_span:last-child]:gap-[10px] [&_span:last-child]:items-center max-[1100px]:left-[28px] max-[1100px]:right-[28px] max-[700px]:left-[20px] max-[700px]:right-[20px] max-[700px]:text-[6px]"
              }
              aria-hidden="true"
            >
              <span>COMMERCE, WITH CONFIDENCE.</span>
              <span>
                SCROLL TO EXPLORE <ArrowDown size={12} />
              </span>
            </div>
          </section>
          <div
            className={
              "principles-strip grid grid-cols-[repeat(4,_1fr)] [border-bottom:1px_solid_var(--line)] py-0 px-[24px] [&>span]:min-h-[76px] [&>span]:flex [&>span]:items-center [&>span]:justify-center [&>span]:gap-[9px] [&>span]:text-muted-foreground [&>span]:text-[11px] [&_svg]:text-[#7e8b71] max-[1100px]:py-0 max-[1100px]:px-[10px] max-[1100px]:[&>span]:text-[9px] max-[700px]:grid-cols-[1fr_1fr] max-[700px]:p-0 max-[700px]:[&>span]:text-[9px] max-[700px]:[&>span]:min-h-[58px] max-[700px]:[&>span]:gap-[7px] max-[700px]:[&>span:nth-child(odd)]:[border-right:1px_solid_var(--line)] max-[700px]:[&>span:nth-child(n+3)]:[border-top:1px_solid_var(--line)] max-[700px]:[&_svg]:w-[13px]"
            }
            data-reveal-stagger
          >
            <span>
              <Zap size={16} /> Instant merchant settlement
            </span>
            <span>
              <ShieldCheck size={16} /> Full order coverage
            </span>
            <span>
              <LockKeyhole size={16} /> Reserves enforced on-chain
            </span>
            <span>
              <Code2 size={16} /> Open source by design
            </span>
          </div>
          <section
            className={
              'flow-section [padding:70px_64px_64px] max-[1100px]:pl-[36px] max-[1100px]:pr-[36px] max-[700px]:py-[48px] max-[700px]:px-[26px] max-[380px]:pl-[20px] max-[380px]:pr-[20px] section-frame relative [border-bottom:1px_solid_var(--line)] [&::before]:[content:"+"] [&::before]:absolute [&::before]:bottom-[-9px] [&::before]:text-[#9ba391] [&::before]:[font:17px_var(--mono)] [&::before]:z-[2] [&::before]:left-[-6px] [&::after]:[content:"+"] [&::after]:absolute [&::after]:bottom-[-9px] [&::after]:text-[#9ba391] [&::after]:[font:17px_var(--mono)] [&::after]:z-[2] [&::after]:right-[-6px]'
            }
            id="how"
            aria-labelledby="flow-title"
          >
            <div
              className={
                "section-heading flex justify-between items-end gap-[32px] mb-[42px] [&_h2]:mt-[22px] [&>p]:text-muted-foreground [&>p]:text-[13px] [&>p]:max-w-[345px] [&>p]:mb-[4px] max-[900px]:[&>p]:text-[11px] max-[900px]:[&>p]:max-w-[270px] max-[700px]:block max-[700px]:mb-[29px] max-[700px]:[&_h2]:mt-[20px] max-[700px]:[&>p]:mt-[20px] max-[700px]:[&>p]:text-[12px] max-[700px]:[&>p]:max-w-[none] max-[700px]:[&>p_br]:hidden"
              }
              data-reveal
            >
              <div>
                <SectionLabel number="01">THE PAYMENT FLOW</SectionLabel>
                <h2 id="flow-title">
                  Fast money.
                  <br />
                  <span>A little more peace of mind.</span>
                </h2>
              </div>
              <p>
                Stablecoins move in seconds.
                <br />
                Trust should move with them.
              </p>
            </div>
            <div
              className={
                "flow-grid grid grid-cols-[repeat(4,_1fr)] [border:1px_solid_var(--line)] [&_article]:[padding:25px_22px_20px] [&_article]:bg-[#f8f9f4] [&_article]:[transition:background-color_220ms_ease] [&_article+article]:[border-left:1px_solid_var(--line)] [&_h3]:text-[15px] [&_h3]:tracking-[-0.4px] [&_h3]:mb-[12px] [&_p]:text-[11px] [&_p]:text-[#646e5a] [&_p]:leading-[1.8] [&_p]:min-h-[80px] max-[1100px]:[&_article]:[padding:23px_16px_18px] max-[1100px]:[&_h3]:text-[13px] max-[1100px]:[&_p]:min-h-[100px] max-[900px]:grid-cols-[1fr_1fr] max-[900px]:[&_article]:p-[25px] max-[900px]:[&_article:nth-child(3)]:[border-left:0] max-[900px]:[&_article:nth-child(n+3)]:[border-top:1px_solid_var(--line)] max-[900px]:[&_p]:min-h-[0] max-[900px]:[&_p]:text-[12px] max-[900px]:[&_h3]:text-[16px] max-[700px]:[&_article]:[padding:22px_17px_18px] max-[700px]:[&_h3]:text-[13px] max-[700px]:[&_h3]:leading-[1.4] max-[700px]:[&_p]:text-[10px] max-[380px]:grid-cols-[minmax(0,_1fr)] max-[380px]:[&_article+article]:[border-left:0] max-[380px]:[&_article+article]:[border-top:1px_solid_var(--line)] max-[380px]:[&_h3]:text-[16px] max-[380px]:[&_p]:text-[12px] [@media((hover:_hover)_and_(pointer:_fine))]:[&_article:hover]:bg-[#edf2e7] [@media((hover:_hover)_and_(pointer:_fine))]:[&_article:hover_.step-top_svg]:[transform:translateY(-2px)]"
              }
              data-reveal-stagger
            >
              {steps.map((step, index) => (
                <article key={step.title}>
                  <div
                    className={
                      "step-top flex justify-between items-center text-primary mb-[34px] [&_span]:[font:9px_var(--mono)] [&_span]:text-muted-foreground max-[900px]:mb-[25px] max-[700px]:mb-[22px] [&_svg]:[transition:transform_280ms_var(--ease-settle)] motion-reduce:[&_svg]:[transform:none]!"
                    }
                  >
                    <step.icon size={21} strokeWidth={1.5} />
                    <span>0{index + 1}</span>
                  </div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                  <span
                    className={
                      "step-tag block [font:7px_var(--mono)] tracking-[0.6px] text-muted-foreground [border-top:1px_solid_var(--line)] pt-[16px] mt-[24px] whitespace-nowrap max-[900px]:mt-[22px] max-[900px]:text-[8px] max-[700px]:text-[6px] max-[700px]:tracking-[0.1px] max-[380px]:text-[8px]"
                    }
                  >
                    {step.tag}
                  </span>
                </article>
              ))}
            </div>
          </section>
          <CheckoutDemo />
          <section
            className={
              'merchant-section grid grid-cols-[1fr_1fr] gap-[72px] py-[78px] px-[64px] bg-[#293025] text-[#f5f7ed] overflow-hidden [&_.section-label]:text-[#a7b697] max-[1100px]:pl-[36px] max-[1100px]:pr-[36px] max-[1100px]:gap-[42px] max-[900px]:gap-[30px] max-[700px]:py-[48px] max-[700px]:px-[26px] max-[700px]:grid-cols-[minmax(0,_1fr)] max-[700px]:gap-[36px] max-[380px]:pl-[20px] max-[380px]:pr-[20px] [&_.section-label>span]:text-[#b6c4a8] section-frame relative [border-bottom:1px_solid_var(--line)] [&::before]:[content:"+"] [&::before]:absolute [&::before]:bottom-[-9px] [&::before]:text-[#9ba391] [&::before]:[font:17px_var(--mono)] [&::before]:z-[2] [&::before]:left-[-6px] [&::after]:[content:"+"] [&::after]:absolute [&::after]:bottom-[-9px] [&::after]:text-[#9ba391] [&::after]:[font:17px_var(--mono)] [&::after]:z-[2] [&::after]:right-[-6px]'
            }
            id="merchants"
            aria-labelledby="merchant-title"
          >
            <div
              className={
                "merchant-copy [&_h2]:text-[44px] [&_h2]:mt-[24px] [&>p]:text-[#a5af9b] [&>p]:text-[12px] [&>p]:max-w-[390px] [&>p]:mt-[24px] [&>.text-button]:text-[#d2e3bd] [&>.text-button]:text-[11px] [&>.text-button:hover]:text-white max-[1100px]:[&_h2]:text-[39px] max-[900px]:[&_h2]:text-[33px] max-[900px]:[&>p]:text-[11px] max-[700px]:[&_h2]:text-[36px] max-[700px]:[&>p]:text-[12px] max-[700px]:[&>p]:max-w-[100%]"
              }
              data-reveal
            >
              <SectionLabel number="03">FOR THE MERCHANTS</SectionLabel>
              <h2 id="merchant-title">
                Your revenue.
                <br />
                Not a waiting room.
              </h2>
              <p>
                You did the work. Your cash flow shouldn’t have to wait. Get
                most of every payment upfront, while your reserve gives buyers a
                reason to trust you.
              </p>
              <div
                className={
                  "merchant-points grid gap-[13px] [margin:24px_0_29px] text-[#c2ccba] text-[10px] [&_span]:flex [&_span]:items-center [&_span]:gap-[8px] [&_svg]:text-[#93ae7c] max-[900px]:text-[9px] max-[700px]:text-[10px]"
                }
              >
                <span>
                  <Check size={15} /> Most of every payment, available
                  immediately
                </span>
                <span>
                  <Check size={15} /> Only open orders lock collateral
                </span>
                <span>
                  <Check size={15} /> Surplus reserve stays withdrawable
                </span>
              </div>
              <Button asChild variant="unstyled" size="unstyled">
                <a
                  href="#demo"
                  className={
                    "text-button inline-flex items-center gap-[9px] text-[13px] font-[500] [background:none] [border:0] p-0 cursor-pointer [transition:color_180ms_ease,_background-color_180ms_ease,_border-color_180ms_ease,_box-shadow_180ms_ease,_transform_220ms_var(--ease-settle)] [&:hover]:text-primary [&>svg]:[transition:transform_280ms_var(--ease-settle)] [@media((hover:_hover)_and_(pointer:_fine))]:[&:not(:disabled):hover>svg:last-child:not(.left-hint)]:[transform:translateX(3px)] motion-reduce:[&>svg]:[transform:none]!"
                  }
                >
                  See how settlement works <ArrowUpRight size={16} />
                </a>
              </Button>
            </div>
            <Card
              as="div"
              className={
                "merchant-dashboard text-[#edf1e7] self-center [border:1px_solid_#58624e] bg-[#333c2e] p-[24px] relative shadow-[9px_9px_0_#2c3526,_10px_10px_0_#48533f] max-[900px]:p-[19px] max-[700px]:p-[23px] max-[700px]:mr-[8px] max-[380px]:p-[17px] [&.is-revealed_.balance-chart_span]:[transform-origin:left] [&.is-revealed_.balance-chart_span]:animate-[reserve-fill_800ms_var(--ease-settle)_160ms_both] [&.is-revealed_.balance-chart_span:last-child]:animate-[reserve-fill_800ms_var(--ease-settle)_280ms_both,_reserve-shimmer_1200ms_linear_infinite]"
              }
              data-reveal
            >
              <div
                className={
                  "dashboard-top flex items-center gap-[10px] text-[11px] pb-[25px] [border-bottom:1px_solid_#4a5443] [&>span:nth-child(2)]:grid [&>span:nth-child(2)]:gap-[5px] [&_small]:[font:7px_var(--mono)] [&_small]:tracking-[1px] [&_small]:text-[#9daa90] [&_.demo-badge]:ml-auto [&_.demo-badge]:border-[#5a674e] [&_.demo-badge]:bg-[#414d36] [&_.demo-badge]:text-[#b5c5a4] [&_.demo-badge]:text-[6px]"
                }
              >
                <span
                  className={
                    "dashboard-avatar h-[32px] w-[32px] grid place-items-center [border:1px_solid_#59674d] [font:italic_23px_Georgia] text-[#b8c9a8] bg-[#424e38]"
                  }
                >
                  N
                </span>
                <span>
                  Northstar Studio<small>MERCHANT RESERVE</small>
                </span>
                <span
                  className={
                    "demo-badge [font:7px_var(--mono)] tracking-[1px] bg-[#edf0e7] [border:1px_solid_#dce2d3] text-muted-foreground py-[4px] px-[6px]"
                  }
                >
                  EXAMPLE
                </span>
              </div>
              <div
                className={
                  "balance-label flex items-center justify-between text-[#a0ad93] text-[10px] [margin:26px_0_9px]"
                }
              >
                Total reserve <LockKeyhole size={13} />
              </div>
              <div
                className={
                  "reserve-balance text-[38px] tracking-[-1.4px] font-[400] whitespace-nowrap [&>span]:text-[#97a889] [&_small]:[font:9px_var(--mono)] [&_small]:tracking-[0] max-[900px]:text-[32px] max-[700px]:text-[36px] max-[380px]:text-[31px]"
                }
              >
                $12,500
                <span>
                  .00 <small>USDC</small>
                </span>
              </div>
              <div
                className={
                  "balance-chart flex gap-[4px] h-[31px] [margin:26px_0_18px] [&_span:first-child]:w-[64%] [&_span:first-child]:bg-[#c8dfad] [&_span:last-child]:flex-[1] [&_span:last-child]:[background:repeating-linear-gradient(135deg,_#697b57_0_2px,_#46553a_2px_6px)] [&_span:last-child]:bg-size-[8.485281px_8.485281px] [&_span:last-child]:[border:1px_solid_#788b65]"
                }
              >
                <span />
                <span />
              </div>
              <div
                className={
                  "balance-key grid gap-[14px] text-[#a9b69d] text-[9px] [&>span]:flex [&>span]:items-center [&>span]:gap-[6px] [&_i]:w-[5px] [&_i]:h-[5px] [&_i]:bg-[#c8dfad] [&>span:last-child_i]:bg-[#6c8059] [&_b]:[font:10px_var(--mono)] [&_b]:ml-auto [&_b]:text-[#d2ddc8]"
                }
              >
                <span>
                  <i /> Available to withdraw <b>$8,000.00</b>
                </span>
                <span>
                  <i /> Backing open orders <b>$4,500.00</b>
                </span>
              </div>
              <div
                className={
                  "dashboard-bottom mt-[26px] pt-[20px] [border-top:1px_solid_#4a5443] flex items-center gap-[7px] text-[#c1d5ac] text-[9px] [&>span:last-child]:ml-auto [&>span:last-child]:[font:10px_var(--mono)] max-[900px]:text-[8px] max-[900px]:gap-[5px] max-[700px]:text-[9px] max-[380px]:text-[8px]"
                }
              >
                <ShieldCheck size={18} />
                <span>Every open order. Fully covered.</span>
                <span>100%</span>
              </div>
            </Card>
          </section>
          <section
            className={
              'protocol-section grid grid-cols-[1fr_1fr] items-center gap-[72px] py-[77px] px-[64px] max-[1100px]:pl-[36px] max-[1100px]:pr-[36px] max-[1100px]:gap-[42px] max-[900px]:gap-[30px] max-[700px]:py-[48px] max-[700px]:px-[26px] max-[700px]:grid-cols-[minmax(0,_1fr)] max-[700px]:gap-[33px] max-[380px]:pl-[20px] max-[380px]:pr-[20px] section-frame relative [border-bottom:1px_solid_var(--line)] [&::before]:[content:"+"] [&::before]:absolute [&::before]:bottom-[-9px] [&::before]:text-[#9ba391] [&::before]:[font:17px_var(--mono)] [&::before]:z-[2] [&::before]:left-[-6px] [&::after]:[content:"+"] [&::after]:absolute [&::after]:bottom-[-9px] [&::after]:text-[#9ba391] [&::after]:[font:17px_var(--mono)] [&::after]:z-[2] [&::after]:right-[-6px]'
            }
            id="protocol"
            aria-labelledby="protocol-title"
          >
            <div
              className={
                "protocol-copy [&_h2]:mt-[23px] [&_h2_em]:text-[#768367] [&>p]:text-[#656f5b] [&>p]:max-w-[365px] [&>p]:text-[12px] [&>p]:my-[22px] [&>p]:mx-0 [&_.button]:text-[11px] [&_.button]:min-h-[40px] [&_.button]:py-0 [&_.button]:px-[14px] max-[700px]:[&>p]:max-w-[none]"
              }
              data-reveal
            >
              <SectionLabel number="04">OPEN BY DESIGN</SectionLabel>
              <h2 id="protocol-title">
                Trust the rules.
                <br />
                <em>Verify the code.</em>
              </h2>
              <p>
                Settlement, reserve coverage, and refunds live in one public
                Solana program. Clear rules for everyone on either side of a
                payment.
              </p>
              <Button asChild variant="quiet" size="unstyled">
                <a
                  className={"button button-outline"}
                  href={sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Github size={16} /> View the source{" "}
                  <ArrowUpRight size={15} />
                </a>
              </Button>
            </div>
            <Card
              as="div"
              className={
                "protocol-rules [border:1px_solid_var(--line)] bg-[#f9faf6] [&>.panel-topline]:py-0 [&>.panel-topline]:px-[21px] [&>.panel-topline]:min-h-[48px] [&>.panel-topline]:bg-[#f0f3e9] [&>div:not(.panel-topline)]:flex [&>div:not(.panel-topline)]:gap-[17px] [&>div:not(.panel-topline)]:items-center [&>div:not(.panel-topline)]:min-h-[70px] [&>div:not(.panel-topline)]:[border-bottom:1px_solid_var(--line)] [&>div:not(.panel-topline)]:py-0 [&>div:not(.panel-topline)]:px-[21px] [&>div>span:first-child]:[font:9px_var(--mono)] [&>div>span:first-child]:text-muted-foreground [&>div>p]:text-[12px] [&>div>svg]:text-[#7b9169] [&>div>svg]:ml-auto [&>div>svg]:[transition:transform_280ms_var(--ease-settle)] max-[900px]:[&>div>p]:text-[10px] max-[900px]:[&>div:not(.panel-topline)]:gap-[12px] max-[900px]:[&>div:not(.panel-topline)]:py-0 max-[900px]:[&>div:not(.panel-topline)]:px-[16px] max-[700px]:[&>div>p]:text-[11px] max-[700px]:[&>div:not(.panel-topline)]:py-0 max-[700px]:[&>div:not(.panel-topline)]:px-[20px] max-[380px]:[&>div>p]:text-[10px] [@media((hover:_hover)_and_(pointer:_fine))]:[&>div:hover>svg]:[transform:translateY(-2px)] motion-reduce:[&>div>svg]:[transform:none]!"
              }
              data-reveal
            >
              <div
                className={
                  "panel-topline min-h-[49px] flex items-center justify-between gap-[10px] py-0 px-[24px] [border-bottom:1px_solid_var(--line)] [font:8px_var(--mono)] tracking-[0.9px] text-muted-foreground [&>span]:flex [&>span]:items-center [&>span]:gap-[8px] max-[700px]:py-0 max-[700px]:px-[23px]"
                }
              >
                <span>
                  <Code2 size={14} /> THE RESERVE INVARIANT
                </span>
                <span>01—03</span>
              </div>
              <div>
                <span>01</span>
                <p>Every open order is backed.</p>
                <ShieldCheck size={17} />
              </div>
              <div>
                <span>02</span>
                <p>Locked collateral stays locked.</p>
                <LockKeyhole size={17} />
              </div>
              <div>
                <span>03</span>
                <p>Refunds cover the full payment.</p>
                <RotateCcw size={17} />
              </div>
              <p
                className={
                  "protocol-stage flex items-center justify-center gap-[8px] py-[18px] px-[15px] text-[9px] text-muted-foreground max-[900px]:text-[8px] max-[700px]:text-[8px] max-[380px]:text-[8px]"
                }
              >
                <span
                  className={
                    'status-dot inline-flex items-center gap-[6px] [&::before]:[content:""] [&::before]:w-[5px] [&::before]:h-[5px] [&::before]:bg-[#608a4b] [&::before]:rounded-[50%] [&::before]:inline-block [&::before]:shadow-[0_0_0_3px_#608a4b0c] [&::before]:shrink-[0] [&.neutral::before]:bg-[#8c9185]'
                  }
                />{" "}
                Devnet preview · Deployed on Solana
              </p>
            </Card>
          </section>
          <section
            className={
              'faq-section [padding:68px_64px_76px] grid grid-cols-[1fr_1.6fr] gap-[70px] [&_h2]:mt-[23px] max-[1100px]:pl-[36px] max-[1100px]:pr-[36px] max-[900px]:gap-[35px] max-[700px]:py-[48px] max-[700px]:px-[26px] max-[700px]:grid-cols-[minmax(0,_1fr)] max-[700px]:gap-[30px] max-[700px]:[&_h2_br]:hidden max-[380px]:pl-[20px] max-[380px]:pr-[20px] section-frame relative [border-bottom:1px_solid_var(--line)] [&::before]:[content:"+"] [&::before]:absolute [&::before]:bottom-[-9px] [&::before]:text-[#9ba391] [&::before]:[font:17px_var(--mono)] [&::before]:z-[2] [&::before]:left-[-6px] [&::after]:[content:"+"] [&::after]:absolute [&::after]:bottom-[-9px] [&::after]:text-[#9ba391] [&::after]:[font:17px_var(--mono)] [&::after]:z-[2] [&::after]:right-[-6px]'
            }
            aria-labelledby="faq-title"
          >
            <div>
              <SectionLabel number="05">A FEW GOOD QUESTIONS</SectionLabel>
              <h2 id="faq-title">
                The details <br />
                matter.
              </h2>
            </div>
            <Accordion
              type="single"
              collapsible
              className="min-w-0 border-t border-border"
              data-reveal
            >
              {questions.map(([question, answer], index) => (
                <AccordionItem
                  key={question}
                  value={String(index)}
                  className="border-border last:border-b"
                >
                  <AccordionTrigger className="py-6 text-left text-[13px] font-medium hover:no-underline">
                    {question}
                  </AccordionTrigger>
                  <AccordionContent
                    forceMount
                    className="pb-6 pr-8 text-xs leading-relaxed text-muted-foreground"
                  >
                    {answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
          <section
            className={
              'closing-section text-center py-[70px] px-[24px] bg-[linear-gradient(#dce0d55c_1px,_transparent_1px),_linear-gradient(90deg,_#dce0d55c_1px,_transparent_1px)] bg-size-[50px_50px] [&>.section-label]:justify-center [&>.section-label]:text-[8px] [&>.section-label]:text-muted-foreground [&_h2]:text-[54px] [&_h2]:tracking-[-2.4px] [&_h2]:leading-[1.1] [&_h2]:my-[25px] [&_h2]:mx-0 [&_em]:text-primary [&_.button]:text-[12px] [&_.button]:min-h-[43px] max-[700px]:py-[53px] max-[700px]:px-[22px] max-[700px]:[&_h2]:text-[39px] max-[700px]:[&_h2]:tracking-[-1.7px] max-[700px]:[&>.section-label]:text-[8px] max-[380px]:[&_h2]:text-[34px] section-frame relative [border-bottom:1px_solid_var(--line)] [&::before]:[content:"+"] [&::before]:absolute [&::before]:bottom-[-9px] [&::before]:text-[#9ba391] [&::before]:[font:17px_var(--mono)] [&::before]:z-[2] [&::before]:left-[-6px] [&::after]:[content:"+"] [&::after]:absolute [&::after]:bottom-[-9px] [&::after]:text-[#9ba391] [&::after]:[font:17px_var(--mono)] [&::after]:z-[2] [&::after]:right-[-6px]'
            }
            data-reveal-stagger
          >
            <span
              className={
                "section-label flex items-center gap-[13px] [font:9px_var(--mono)] tracking-[1.3px] text-muted-foreground [&>span]:text-muted-foreground max-[700px]:text-[8px] max-[700px]:tracking-[0.8px] max-[700px]:gap-[9px]"
              }
            >
              BETTER PAYMENTS. BETTER BUSINESS.
            </span>
            <h2>
              A little reserve.
              <br />A lot more <em>confidence.</em>
            </h2>
            <Button asChild variant="ink" size="unstyled">
              <a className={"button button-dark"} href="#demo">
                Give it a try <ArrowRight size={16} />
              </a>
            </Button>
            <span
              className={
                "closing-note block [font:7px_var(--mono)] tracking-[0.8px] text-muted-foreground mt-[19px] max-[700px]:text-[6px]"
              }
            >
              NO REAL FUNDS. JUST A BETTER WAY TO PAY.
            </span>
          </section>
        </main>
        <footer>
          <div
            className={
              "footer-main flex items-center justify-between pb-[34px] [&_.brand]:text-[20px] [&_p]:text-[11px] [&_p]:text-[#68745c] [&_p]:mt-[12px] max-[700px]:items-start max-[700px]:gap-[25px] max-[700px]:[&_p]:text-[9px]"
            }
            data-reveal
          >
            <div>
              <Logo />
              <p>Good commerce starts with trust.</p>
            </div>
            <div
              className={
                'footer-links [&_a:hover]:text-primary flex gap-[26px] items-center text-[10px] text-muted-foreground [&_a:last-child]:flex [&_a:last-child]:gap-[6px] [&_a:last-child]:items-center max-[700px]:flex-col max-[700px]:items-start max-[700px]:gap-[15px] max-[700px]:text-[9px] [&_a]:relative [&_a::after]:[content:""] [&_a::after]:absolute [&_a::after]:left-0 [&_a::after]:right-0 [&_a::after]:bottom-[-5px] [&_a::after]:h-[1px] [&_a::after]:bg-current [&_a::after]:[transform:scaleX(0)] [&_a::after]:[transform-origin:left] [&_a::after]:[transition:transform_250ms_var(--ease-settle)] [&_a:focus-visible::after]:[transform:scaleX(1)] [@media((hover:_hover)_and_(pointer:_fine))]:[&_a:hover::after]:[transform:scaleX(1)]'
              }
            >
              <a href="#how">How it works</a>
              <a href="#demo">Try the demo</a>
              <a href={sourceUrl} target="_blank" rel="noreferrer">
                GitHub <ExternalLink size={12} />
              </a>
            </div>
          </div>
          <div
            className={
              "footer-bottom flex justify-between items-center [border-top:1px_solid_var(--line)] min-h-[59px] [font:8px_var(--mono)] text-muted-foreground [&>span:nth-child(2)]:flex [&>span:nth-child(2)]:items-center [&>span:nth-child(2)]:gap-[7px] [&>span:nth-child(2)]:text-[8px] [&>span:nth-child(2)]:tracking-[0.7px] [&>a]:text-[8px] [&>a]:tracking-[0.8px] max-[700px]:text-[8px] max-[700px]:[&>span:nth-child(2)]:hidden"
            }
          >
            <span>© {new Date().getFullYear()} ReservePay</span>
            <span>
              <span
                className={
                  'status-dot inline-flex items-center gap-[6px] [&::before]:[content:""] [&::before]:w-[5px] [&::before]:h-[5px] [&::before]:bg-[#608a4b] [&::before]:rounded-[50%] [&::before]:inline-block [&::before]:shadow-[0_0_0_3px_#608a4b0c] [&::before]:shrink-[0] [&.neutral::before]:bg-[#8c9185]'
                }
              />{" "}
              BUILT ON SOLANA
            </span>
            <KeyboardShortcuts />
            <a href="#top">BACK TO TOP ↑</a>
          </div>
        </footer>
      </div>
    </div>
  );
}
