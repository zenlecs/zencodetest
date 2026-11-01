import { useRef } from "react";
import { useLocation } from "wouter";
import {
  LayoutDashboard,
  Wallet,
  Presentation,
  MessageSquare,
  Calculator,
  Globe2,
  type LucideIcon,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  MotionValue,
  animate,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "motion/react";
import { useBrowserStore } from "@/lib/stores/browser-store";
import { X, Globe } from "lucide-react";

type NavItem = {
  title: string;
  url: string;
  icon?: LucideIcon;
  /** Custom SVG icon (e.g. Studio) */
  iconSrc?: string;
  /** Custom SVG wordmark shown in hover tooltip */
  tooltipImg?: string;
};

const mainNavItems: NavItem[] = [
  { title: "Dashboard", url: "/os", icon: LayoutDashboard },
  {
    title: "Studio",
    url: "/os/studio",
    iconSrc: "./studioico.svg",
    tooltipImg: "./studio.svg",
  },
  { title: "E-Wallet", url: "/os/wallet", icon: Wallet },
  { title: "Sunumlar", url: "/os/presentations", icon: Presentation },
  { title: "İletişim", url: "/os/communications", icon: MessageSquare },
  { title: "Muhasebe", url: "/os/accounting", icon: Calculator },
];

const SCALE = 2.25;
const DISTANCE = 110;
const NUDGE = 40;
const ZENIUM_SCALE = 1.03; // %3 growth only
const ZENIUM_NUDGE = 2; // Minimal nudge to match the minimal scale
const SPRING = {
  mass: 0.1,
  stiffness: 170,
  damping: 12,
};

function AppIcon({
  mouseTop,
  item,
  isActive,
  onNavigate,
  testIdPrefix,
}: {
  mouseTop: MotionValue;
  item: NavItem;
  isActive: boolean;
  onNavigate: (url: string) => void;
  testIdPrefix: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const Icon = item.icon;

  const distance = useTransform(() => {
    const bounds = ref.current
      ? { y: ref.current.offsetTop, height: ref.current.offsetHeight }
      : { y: 0, height: 0 };

    return mouseTop.get() - bounds.y - bounds.height / 2;
  });

  const scale = useTransform(distance, [-DISTANCE, 0, DISTANCE], [1, SCALE, 1]);
  const y = useTransform(() => {
    const d = distance.get();
    if (d === -Infinity) {
      return 0;
    } else if (d < -DISTANCE || d > DISTANCE) {
      return Math.sign(d) * -1 * NUDGE;
    } else {
      return (-d / DISTANCE) * NUDGE * scale.get();
    }
  });

  const scaleSpring = useSpring(scale, SPRING);
  const ySpring = useSpring(y, SPRING);

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.button
            ref={ref}
            style={{ y: ySpring, scale: scaleSpring }}
            onClick={() => {
              onNavigate(item.url);
            }}
            className={cn(
              "aspect-square flex items-center justify-center w-10 rounded-full shadow origin-left",
              isActive
                ? "bg-primary"
                : "bg-card border border-border/30"
            )}
            data-testid={`${testIdPrefix}-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
          >
            {item.iconSrc ? (
              <img
                src={item.iconSrc}
                alt=""
                draggable={false}
                className={cn(
                  "w-[14px] h-5 object-contain select-none pointer-events-none",
                  isActive ? "opacity-100" : "opacity-55"
                )}
              />
            ) : Icon ? (
              <Icon
                className={cn(
                  "w-5 h-5",
                  isActive ? "text-primary-foreground" : "text-muted-foreground"
                )}
              />
            ) : null}
          </motion.button>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          sideOffset={10}
          className={cn(
            "bg-card shadow shadow-black/20 border border-border rounded text-foreground font-medium",
            item.tooltipImg ? "px-2.5 py-2" : "px-2 py-1.5 text-sm"
          )}
        >
          {item.tooltipImg ? (
            <span
              role="img"
              aria-label={item.title}
              className="block h-3.5 w-[118px] max-w-[120px] bg-foreground select-none"
              style={{
                WebkitMaskImage: `url(${item.tooltipImg})`,
                maskImage: `url(${item.tooltipImg})`,
                WebkitMaskSize: "contain",
                maskSize: "contain",
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat",
                WebkitMaskPosition: "left center",
                maskPosition: "left center",
              }}
            />
          ) : (
            item.title
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ZeniumAppIcon({
  mouseTop,
  title,
  isActive,
  onClick,
  onClose,
  children,
}: {
  mouseTop: MotionValue;
  title: string;
  isActive: boolean;
  onClick: () => void;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  const distance = useTransform(() => {
    const bounds = ref.current
      ? { y: ref.current.offsetTop, height: ref.current.offsetHeight }
      : { y: 0, height: 0 };

    return mouseTop.get() - bounds.y - bounds.height / 2;
  });

  const scale = useTransform(distance, [-DISTANCE, 0, DISTANCE], [1, ZENIUM_SCALE, 1]);
  const y = useTransform(() => {
    const d = distance.get();
    if (d === -Infinity) {
      return 0;
    } else if (d < -DISTANCE || d > DISTANCE) {
      return Math.sign(d) * -1 * ZENIUM_NUDGE;
    } else {
      return (-d / DISTANCE) * ZENIUM_NUDGE * scale.get();
    }
  });

  const scaleSpring = useSpring(scale, SPRING);
  const ySpring = useSpring(y, SPRING);

  return (
    <div className="relative group shrink-0">
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <motion.button
              ref={ref}
              style={{ y: ySpring, scale: scaleSpring }}
              onClick={onClick}
              className={cn(
                "aspect-square block w-10 rounded-full shadow origin-left",
                isActive 
                  ? "bg-primary" 
                  : "bg-card/50 border border-border/30"
              )}
            >
              <div className={cn("w-5 h-5 mx-auto flex items-center justify-center", isActive ? "text-primary-foreground" : "text-muted-foreground")}>
                {children}
              </div>
            </motion.button>
          </TooltipTrigger>
          <TooltipContent
            side="right"
            sideOffset={10}
            className="bg-card shadow shadow-black/20 border border-border px-2 py-1.5 text-sm rounded text-foreground font-medium"
          >
            {title}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {onClose && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
}

export function FloatingNav() {
  const [location, setLocation] = useLocation();
  const { tabs, activeTabId, setActiveTab, removeTab } = useBrowserStore();
  const mouseTop = useMotionValue(-Infinity);
  const mouseBottom = useMotionValue(-Infinity);
  const top = useTransform(mouseTop, [0, 40], [0, -40]);
  const bottom = useTransform(mouseBottom, [0, 40], [0, -40]);
  const topSpring = useSpring(top, SPRING);
  const bottomSpring = useSpring(bottom, SPRING);

  const zeniumMouseTop = useMotionValue(-Infinity);
  const zeniumMouseBottom = useMotionValue(-Infinity);

  const handleNavigation = (url: string) => {
    setLocation(url);
  };

  return (
    <div className="fixed left-4 top-1/2 -translate-y-1/2 z-40" data-testid="floating-nav">
      <motion.div
        onMouseMove={(e) => {
          const { top, bottom } = e.currentTarget.getBoundingClientRect();
          const offsetTop = e.clientY - top;
          const offsetBottom = bottom - e.clientY;
          mouseTop.set(offsetTop);
          mouseBottom.set(offsetBottom);
        }}
        onMouseLeave={() => {
          mouseTop.set(-Infinity);
          mouseBottom.set(-Infinity);
        }}
        className="flex flex-col items-center gap-3 px-2 py-2 relative"
      >
        <motion.div
          className="absolute rounded-2xl inset-x-0 bg-card/80 backdrop-blur-xl border border-border/30 -z-10"
          style={{ top: topSpring, bottom: bottomSpring }}
        />

        {mainNavItems.map((item) => {
          const isActive = location === item.url || 
            (item.url !== "/" && location.startsWith(item.url));
          
          return (
            <AppIcon
              key={item.title}
              mouseTop={mouseTop}
              item={item}
              isActive={isActive}
              onNavigate={handleNavigation}
              testIdPrefix="nav"
            />
          );
        })}
      </motion.div>

      {/* Zenium Browser Container */}
      <motion.div
        onMouseMove={(e) => {
          const { top } = e.currentTarget.getBoundingClientRect();
          const scrollTop = e.currentTarget.scrollTop;
          const offsetTop = (e.clientY - top) + scrollTop;
          zeniumMouseTop.set(offsetTop);
        }}
        onMouseLeave={() => {
          zeniumMouseTop.set(-Infinity);
        }}
        className={cn(
          "absolute top-[calc(100%+60px)] left-0 w-full flex flex-col items-center gap-3 px-2 py-2",
          tabs.length > 5 ? "max-h-[300px] overflow-y-auto scrollbar-none [&::-webkit-scrollbar]:hidden" : ""
        )}
      >
        <ZeniumAppIcon
          mouseTop={zeniumMouseTop}
          title="Zenium Tarayıcı"
          isActive={location.startsWith('/os/browser') && !activeTabId}
          onClick={() => {
            setActiveTab(null);
            if (!location.startsWith('/os/browser')) {
              setLocation('/os/browser');
            }
          }}
        >
          <Globe2 className="w-5 h-5" />
        </ZeniumAppIcon>

        {tabs.length > 0 && (
          <div className="w-6 h-px bg-border/50 rounded-full shrink-0" />
        )}

        {tabs.map((tab) => {
          const isActive = location.startsWith('/os/browser') && activeTabId === tab.id;
          
          return (
            <ZeniumAppIcon
              key={tab.id}
              mouseTop={zeniumMouseTop}
              title={tab.title}
              isActive={isActive}
              onClick={() => {
                setActiveTab(tab.id);
                if (!location.startsWith('/os/browser')) {
                  setLocation('/os/browser');
                }
              }}
              onClose={() => removeTab(tab.id)}
            >
              {tab.favicon ? (
                <img src={tab.favicon} alt={tab.title} className="w-5 h-5 rounded-sm object-contain" />
              ) : (
                <Globe className="w-5 h-5" />
              )}
            </ZeniumAppIcon>
          );
        })}
      </motion.div>
    </div>
  );
}
