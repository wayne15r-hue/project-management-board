import {
  ArrowUpRight,
  Check,
  Circle,
  Columns3,
  MessageSquare,
  MicOff,
  MoreHorizontal,
  ScreenShare,
  Sparkles,
  VideoOff,
} from "lucide-react";
import { BrandMark } from "@/components/shared/brand-logo";

export const CHAPTERS = [
  {
    label: "Work",
    eyebrow: "A clear path from plan to done",
    title: "Keep the big picture. Move the small things.",
    description:
      "Plan on boards, switch to a table or timeline, and find your assignments in My Work. Use AI to draft tasks or extract next steps from a brief.",
    detail: "Boards · Alternate views · My Work · AI task creation",
  },
  {
    label: "Approvals",
    eyebrow: "Decisions with a trail",
    title: "Make the handoff as clear as the work.",
    description:
      "Name an independent reviewer, discuss the deliverable and see what needs attention. Flag blocked work with a reason, and keep the decision history in view.",
    detail: "Independent reviews · Comments · Blocked work · History",
  },
  {
    label: "Service Desk",
    eyebrow: "A home for the everyday ask",
    title: "Turn “can someone help?” into a clear next step.",
    description:
      "Give internal requests a place to land. Triage tickets, assign an owner and add approval gates where needed, with team access and private attachments.",
    detail: "Request intake · Triage · Assignment · Approval gates",
  },
  {
    label: "LeaveDesk",
    eyebrow: "Plan around people",
    title: "See availability. Give everyone room.",
    description:
      "Bring leave balances, working calendars and manager reviews into one workflow. Department calendars help teammates plan around availability while sensitive files stay restricted.",
    detail: "Leave balances · Working calendars · Holidays · Reviews",
  },
  {
    label: "Chat & Calls",
    eyebrow: "Stay close to the context",
    title: "From a quick message to a shared perspective.",
    description:
      "Talk in direct and group conversations, move into a video call and follow shared screens. AI writing assistance and summaries support the conversation. Calls and AI depend on workspace configuration.",
    detail: "Direct & group chat · Video · Shared screens · AI assistance",
  },
  {
    label: "People",
    eyebrow: "A workspace with people at its center",
    title: "Know who’s who. And who to go to.",
    description:
      "Keep employee records, departments and reporting managers connected. Administrative access stays with authorized people, so the right person can maintain the right information.",
    detail: "Employee records · Departments · Managers · Administration",
  },
] as const;

function Badge({
  children,
  tone = "",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`sample-badge ${tone}`}>{children}</span>;
}
function Person({ initials, name }: { initials: string; name?: string }) {
  return (
    <span className="sample-person">
      <span className="sample-avatar">{initials}</span>
      {name}
    </span>
  );
}

function Work() {
  const columns = [
    {
      title: "To do",
      tasks: [
        ["Draft launch checklist", "Operations", "LP"],
        ["Outline help center", "Content", "MR"],
      ],
    },
    {
      title: "In progress",
      tasks: [
        ["Prepare onboarding guide", "People", "TS"],
        ["Review intake workflow", "Operations", "LP"],
      ],
    },
    {
      title: "In review",
      tasks: [
        ["Finalize release brief", "Product", "MR"],
        ["Check team handoffs", "Operations", "TS"],
      ],
    },
  ];
  return (
    <>
      <div className="sample-viewbar">
        <span className="sample-view-active">
          <Columns3 size={14} /> Board
        </span>
        <span>Table</span>
        <span>Timeline</span>
        <span className="sample-spacer" />
        <span>
          <Sparkles size={14} /> AI task draft
        </span>
      </div>
      <div className="sample-board">
        {columns.map((column) => (
          <div className="sample-column" key={column.title}>
            <div className="sample-column-title">
              <Circle size={9} />
              <span>{column.title}</span>
              <span>2</span>
            </div>
            {column.tasks.map(([title, label, initials]) => (
              <div className="sample-task" key={title}>
                <Badge>{label}</Badge>
                <h4>{title}</h4>
                <div className="sample-task-meta">
                  <span>
                    <MessageSquare size={12} /> 2
                  </span>
                  <Person initials={initials} />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="sample-bottom">
        <Check size={14} /> My Work brings assignments and owned-board work
        together.
      </div>
    </>
  );
}
function Approvals() {
  return (
    <div className="sample-split">
      <div>
        <div className="sample-row">
          <Badge tone="amber">Pending review</Badge>
          <span>Release brief</span>
        </div>
        <h4>Ready for a second pair of eyes</h4>
        <p>Owner: Leo Park · Reviewer: Maya Reed</p>
        <div className="sample-comment">
          <Person initials="LP" name="Leo Park" />
          <p>
            The revised brief is attached. Please check the handoff section.
          </p>
        </div>
        <div className="sample-comment">
          <Person initials="MR" name="Maya Reed" />
          <p>
            I’ll check the acceptance criteria before completing the review.
          </p>
        </div>
      </div>
      <aside>
        <h4>Decision history</h4>
        <p>Draft updated</p>
        <p>Review requested</p>
        <Badge tone="amber">Awaiting reviewer</Badge>
        <hr />
        <Badge>Blocked work</Badge>
        <p>Translation task: waiting for the approved brief.</p>
      </aside>
    </div>
  );
}
function ServiceDesk() {
  return (
    <div className="sample-list">
      <div className="sample-list-heading">
        <span>Request / owner</span>
        <span>Status</span>
      </div>
      {[
        ["SD-024", "New starter equipment", "Leo Park", "Awaiting approval"],
        ["SD-023", "Update help center access", "Maya Reed", "In progress"],
        ["SD-022", "Meeting room display", "Tess Shaw", "Triage"],
      ].map(([id, title, name, status]) => (
        <div className="sample-request" key={id}>
          <div>
            <small>{id}</small>
            <h4>{title}</h4>
            <p>{name} · Internal Operations team</p>
          </div>
          <Badge tone={status === "Awaiting approval" ? "amber" : ""}>
            {status}
          </Badge>
        </div>
      ))}
      <div className="sample-bottom">
        Team access · Approval gates · Private attachments
      </div>
    </div>
  );
}
function LeaveDesk() {
  return (
    <div className="sample-split">
      <div>
        <h4>Department availability</h4>
        <p>Sample week · 9–13 November</p>
        <div className="sample-calendar">
          {["Mon 9", "Tue 10", "Wed 11", "Thu 12", "Fri 13"].map((day, i) => (
            <div key={day}>
              <small>{day}</small>
              <span className={i === 2 ? "sample-away" : ""}>
                {i === 2 ? "Maya · Away" : "Available"}
              </span>
            </div>
          ))}
        </div>
        <div className="sample-bottom">
          Coworker view shows availability only.
        </div>
      </div>
      <aside>
        <h4>My leave</h4>
        <strong className="sample-number">
          12 <small>days remaining</small>
        </strong>
        <p>Annual leave · Sample policy</p>
        <Badge tone="amber">2 days awaiting manager review</Badge>
        <hr />
        <p>Working schedule: Mon–Fri</p>
        <p>Holiday calendars follow your assigned schedule.</p>
      </aside>
    </div>
  );
}
function Calls() {
  return (
    <div className="sample-call">
      <div className="sample-presentation">
        <div>
          <ScreenShare size={24} />
          <span>Launch plan · Shared-screen layout</span>
        </div>
        <div className="sample-slide">
          <small>TEAM CHECK-IN</small>
          <h4>
            One launch.
            <br />A shared direction.
          </h4>
          <div className="sample-slide-line" />
          <p>Plan → Review → Deliver</p>
        </div>
      </div>
      <div className="sample-call-tiles">
        {[
          ["LP", "Leo Park"],
          ["MR", "Maya Reed"],
          ["TS", "Tess Shaw"],
        ].map(([initials, name]) => (
          <div key={name}>
            <Person initials={initials} />
            <span>{name}</span>
            <span>
              <VideoOff size={12} />
              <MicOff size={12} />
            </span>
          </div>
        ))}
      </div>
      <p className="sample-call-note">
        Illustrated call layout · No media connection or device access
      </p>
    </div>
  );
}
function People() {
  return (
    <div className="sample-list">
      <div className="sample-list-heading">
        <span>People directory</span>
        <span>Sample admin view</span>
      </div>
      {[
        ["LP", "Leo Park", "Operations", "Maya Reed"],
        ["MR", "Maya Reed", "Operations", "No reporting manager"],
        ["TS", "Tess Shaw", "Product", "Maya Reed"],
      ].map(([initials, name, department, manager]) => (
        <div className="sample-request" key={name}>
          <div>
            <Person initials={initials} name={name} />
            <p>
              {department} · Reporting to: {manager}
            </p>
          </div>
          <Badge>Active</Badge>
        </div>
      ))}
      <div className="sample-bottom">
        Employee administration is restricted to authorized admins.
      </div>
    </div>
  );
}

export function ProductPreview({
  index,
  compact = false,
}: {
  index: number;
  compact?: boolean;
}) {
  const views = [Work, Approvals, ServiceDesk, LeaveDesk, Calls, People];
  const View = views[index];
  return (
    <div
      className={`sample-window ${compact ? "sample-compact" : ""}`}
      aria-label={`${CHAPTERS[index].label} fictional product preview`}
    >
      <div className="sample-chrome">
        <span className="sample-chrome-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span>Sample workspace</span>
        <MoreHorizontal size={17} aria-hidden="true" />
      </div>
      <div className="sample-shell">
        {!compact && (
          <div className="sample-sidebar">
            <BrandMark className="h-7 w-7" />
            <strong>Northstar Studio</strong>
            <span>My Work</span>
            <span className="sample-sidebar-active">Launch workspace</span>
            <span>Service Desk</span>
            <span>LeaveDesk</span>
            <span>Chat</span>
            <span>People</span>
            <small>FICTIONAL TEAM</small>
            <div>
              <Person initials="LP" />
              <Person initials="MR" />
              <Person initials="TS" />
            </div>
          </div>
        )}
        <div className="sample-main">
          <div className="sample-title">
            <div>
              <small>Northstar Studio / {CHAPTERS[index].label}</small>
              <h3>
                {index === 0
                  ? "A little clarity. A lot of progress."
                  : CHAPTERS[index].label}
              </h3>
            </div>
            <ArrowUpRight size={18} aria-hidden="true" />
          </div>
          <View />
        </div>
      </div>
    </div>
  );
}
