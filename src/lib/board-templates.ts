export interface BoardTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  columns: { name: string; color: string }[];
  labels: { name: string; color: string }[];
}

export const BOARD_TEMPLATES: BoardTemplate[] = [
  {
    id: "sprint",
    name: "Sprint Board",
    description:
      "Agile sprint planning with backlog, in progress, review, and done",
    icon: "🏃",
    columns: [
      { name: "Backlog", color: "#6b7280" },
      { name: "To Do", color: "#6366f1" },
      { name: "In Progress", color: "#f59e0b" },
      { name: "In Review", color: "#8b5cf6" },
      { name: "Done", color: "#22c55e" },
    ],
    labels: [
      { name: "Bug", color: "#ef4444" },
      { name: "Feature", color: "#3b82f6" },
      { name: "Enhancement", color: "#8b5cf6" },
      { name: "Documentation", color: "#6b7280" },
    ],
  },
  {
    id: "marketing",
    name: "Marketing Campaign",
    description: "Plan and track marketing campaigns from ideation to launch",
    icon: "📢",
    columns: [
      { name: "Ideas", color: "#eab308" },
      { name: "Planning", color: "#3b82f6" },
      { name: "In Progress", color: "#f59e0b" },
      { name: "Review", color: "#8b5cf6" },
      { name: "Published", color: "#22c55e" },
    ],
    labels: [
      { name: "Social Media", color: "#ec4899" },
      { name: "Email", color: "#06b6d4" },
      { name: "Blog", color: "#22c55e" },
      { name: "Ad Campaign", color: "#f97316" },
    ],
  },
  {
    id: "roadmap",
    name: "Product Roadmap",
    description: "Track product development from discovery to release",
    icon: "🗺️",
    columns: [
      { name: "Discovery", color: "#eab308" },
      { name: "Design", color: "#ec4899" },
      { name: "Development", color: "#3b82f6" },
      { name: "Testing", color: "#f59e0b" },
      { name: "Released", color: "#22c55e" },
    ],
    labels: [
      { name: "P0 - Critical", color: "#ef4444" },
      { name: "P1 - High", color: "#f97316" },
      { name: "P2 - Medium", color: "#eab308" },
      { name: "P3 - Low", color: "#6b7280" },
    ],
  },
  {
    id: "bugs",
    name: "Bug Tracker",
    description: "Track and resolve bugs and issues",
    icon: "🐛",
    columns: [
      { name: "Reported", color: "#ef4444" },
      { name: "Confirmed", color: "#f59e0b" },
      { name: "In Progress", color: "#3b82f6" },
      { name: "Fixed", color: "#22c55e" },
      { name: "Closed", color: "#6b7280" },
    ],
    labels: [
      { name: "Critical", color: "#ef4444" },
      { name: "Major", color: "#f97316" },
      { name: "Minor", color: "#eab308" },
      { name: "UI", color: "#8b5cf6" },
      { name: "Backend", color: "#06b6d4" },
    ],
  },
  {
    id: "blank",
    name: "Blank Board",
    description: "Start from scratch with empty columns",
    icon: "📋",
    columns: [
      { name: "To Do", color: "#6366f1" },
      { name: "In Progress", color: "#f59e0b" },
      { name: "Done", color: "#22c55e" },
    ],
    labels: [],
  },
];
