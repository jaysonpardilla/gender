declare module 'lucide-react' {
  import * as React from 'react';

  export interface IconProps {
    size?: number | string;
    color?: string;
    strokeWidth?: number | string;
    absoluteStrokeWidth?: boolean;
    className?: string;
    style?: React.CSSProperties;
    children?: React.ReactNode;
  }

  // DocumentPreview icons
  export const ChevronLeft: React.FC<IconProps>;
  export const ChevronRight: React.FC<IconProps>;
  export const ZoomIn: React.FC<IconProps>;
  export const ZoomOut: React.FC<IconProps>;
  export const Loader: React.FC<IconProps>;

  // UploadDocument icons
  export const Download: React.FC<IconProps>;
  export const Eye: React.FC<IconProps>;
  export const EyeOff: React.FC<IconProps>;

  // Sidebar icons
  export const LayoutDashboard: React.FC<IconProps>;
  export const FileText: React.FC<IconProps>;
  export const Clock: React.FC<IconProps>;
  export const BarChart3: React.FC<IconProps>;
  export const Settings: React.FC<IconProps>;
  export const BookOpen: React.FC<IconProps>;
  export const Database: React.FC<IconProps>;
  export const HelpCircle: React.FC<IconProps>;

  // Navigation icons
  export const LogOut: React.FC<IconProps>;
  export const ChevronDown: React.FC<IconProps>;

  // General utility icons
  export const Plus: React.FC<IconProps>;
  export const Minus: React.FC<IconProps>;
  export const Home: React.FC<IconProps>;
  export const Menu: React.FC<IconProps>;
  export const X: React.FC<IconProps>;
  export const Check: React.FC<IconProps>;
  export const AlertCircle: React.FC<IconProps>;
  export const Send: React.FC<IconProps>;
  export const Calendar: React.FC<IconProps>;
  export const Copy: React.FC<IconProps>;
  export const Upload: React.FC<IconProps>;
  export const Sparkles: React.FC<IconProps>;
  export const ArrowRight: React.FC<IconProps>;
  export const ChartPie: React.FC<IconProps>;
  export const ShieldCheck: React.FC<IconProps>;

  // Additional icons for pages
  export const Users: React.FC<IconProps>;
  export const TrendingUp: React.FC<IconProps>;
  export const MessageCircle: React.FC<IconProps>;
  export const Mail: React.FC<IconProps>;
  export const Phone: React.FC<IconProps>;
  export const User: React.FC<IconProps>;
  export const LockKeyhole: React.FC<IconProps>;
  export const Bell: React.FC<IconProps>;
  export const Search: React.FC<IconProps>;
}
