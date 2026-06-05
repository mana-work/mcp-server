export interface ManaResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  obj?: T;
}

export interface Workspace {
  _id: string;
  name: string;
  projects: string[];
  status: number;
  admins: string[];
  members: string[];
  guest: string[];
  createBy: string;
  ownedBy: string;
  organization: Organization[];
  happiness: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Organization {
  _id: string;
  name: string;
  members: string[];
}

export interface Project {
  _id: string;
  name: string;
  members: string[];
  admins: string[];
  start: string;
  doneDate: string;
  dueDate: string;
  status: number;
  description: string;
  activities: string[];
  isSave: boolean;
  createBy: string;
  ownedBy: string;
  private: boolean;
  percent: number;
  task: number;
  tasksDone: number;
  inTrashcan: boolean;
  createdAt: string;
  updatedAt: string;
}

export const PROJECT_STATUS: Record<number, string> = {
  0: "No status",
  1: "Scheduled",
  2: "In progress",
  3: "Completed",
  4: "On hold",
  5: "Cancelled",
};

export interface GanttTask {
  _id: string;
  projectId: string;
  id: string;
  text: string;
  description: string;
  start_date: string;
  end_date: string;
  duration: number;
  progress: number;
  parentId: string;
  type: string;
  colorLabel: string;
  impact: string;
  priority: string;
  owners: string[];
  follower: string[];
  assignee: string[];
  tags: string[];
  index: number;
  done: boolean;
  doneBy: string;
  doneDate: string;
  estimation: string;
  vote: Vote[];
  toDolist: ToDoItem[];
  files: TaskFile[];
  comments: Comment[];
  income: number;
  expenses: number;
  workingTime: WorkingTime;
  inTrashcan: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Vote {
  userId: string;
  date: string;
}

export interface ToDoItem {
  check: boolean;
  name: string;
  assignee: string;
  doneBy: string;
}

export interface TaskFile {
  index: number;
  defaultName: string;
  pathFile: string;
  mimetype: string;
  cover: boolean;
  inTrashcan: boolean;
  createdAt: string;
  createBy: string;
}

export interface Comment {
  _id?: string;
  text: string;
  createBy: string;
  updateBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkingTime {
  days: number;
  hours: number;
  minute: number;
}

export interface GanttLink {
  _id: string;
  projectId: string;
  source: string;
  target: string;
  type: string;
}

export interface DashboardData {
  [key: string]: unknown;
}

export interface TaskSummary {
  id: string;
  name: string;
  status: string;
  progress: number;
  startDate: string;
  endDate: string;
  assignees: string[];
  overdue: boolean;
}
