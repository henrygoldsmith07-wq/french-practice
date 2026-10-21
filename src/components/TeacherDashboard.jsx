import { useState, useMemo } from 'react';
import { BarChart2, Users, TrendingUp, Target, Clock, FileText } from './icons';
import { CHIP } from '../components/classNames.js';

/**
 * TeacherDashboard - a preview of a teacher view.
 *
 * There is no class data source in the app: Le Studio is a single-learner,
 * local-first PWA, so nothing here comes from a real classroom. The panel
 * says so on screen, and the export button writes the numbers you are
 * looking at to a CSV — a button that pretends to do something is worse than
 * no button at all.
 */

// The rows behind the panel, in the order the table shows them.
const csvRowsFor = (classes) => {
  const rows = [['class', 'student_id', 'sessions_completed', 'avg_accuracy', 'active_weaknesses', 'status']];
  for (const cls of classes) {
    for (const s of cls.students) {
      rows.push([cls.name, s.id, s.sessionsCompleted, s.avgAccuracy, s.activeWeaknesses, s.status]);
    }
  }
  return rows;
};

const downloadCsv = (classes, filename) => {
  const csv = csvRowsFor(classes)
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Export the rows behind the panel. `target` is a class, a list of classes,
// or nothing (which means every class).
const exportSampleData = (target) => {
  const classes = Array.isArray(target) ? target : target ? [target] : sampleClasses;
  if (!classes.length) return;
  downloadCsv(classes, 'le-studio-sample-class-data.csv');
};

export default function TeacherDashboard({ open, onClose }) {
  // The hooks come BEFORE the early return. React requires the same hooks in
  // the same order on every render, so returning early above them would make
  // the hook count change when the dashboard is opened or closed — which
  // React turns into a crash, not a blank screen.
  const [selectedClass, setSelectedClass] = useState(null);
  const [viewMode, setViewMode] = useState('overview'); // overview | details | reports

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[55] overflow-y-auto bg-bg" role="dialog" aria-modal="true" aria-label="Teacher dashboard">
      <div className="mx-auto min-h-full max-w-7xl px-4 py-4">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <h2 className="flex-1 text-lg font-bold text-ink">Teacher Dashboard</h2>
          <button onClick={onClose} aria-label="Close teacher dashboard" className="grid h-9 w-9 place-items-center rounded-full text-ink2 hover:bg-surface2 hover:text-ink">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M13.5 4.5L4.5 13.5M4.5 4.5L13.5 13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Say what the numbers are. Every figure on this screen is invented:
            there is no classroom connected to the app, and a panel of made-up
            statistics is not a class report. */}
        <div
          role="note"
          className="mb-5 rounded-xl border border-yellow200 bg-yellow50 px-4 py-3 text-xs text-yellow800"
        >
          <strong className="font-semibold">Sample data.</strong>{' '}
          This is a preview of what a class view would look like. No classroom is
          connected, so every number below is made up — including the student
          names, which are not real people.
        </div>

        {/* Sidebar */}
        <aside className="w-72 border-r border-line bg-surface flex flex-col">
          <div className="p-5 border-b border-line">
            <h2 className="text-lg font-bold text-ink">Teacher Dashboard</h2>
            <p className="mt-1 text-xs text-ink2">Free educator tier</p>
          </div>

          {/* Class List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            <button
              onClick={() => { setSelectedClass(null); setViewMode('overview'); }}
              className={`w-full text-left px-4 py-3 rounded-xl transition-colors ${
                selectedClass === null 
                  ? 'bg-accent text-onaccent border border-accent' 
                  : 'hover:bg-surface2 text-ink'
              }`}
            >
              <div className="flex items-center gap-3">
                <Users size={16} />
                <span className="font-semibold">All Classes</span>
              </div>
            </button>

            {sampleClasses.map(cls => (
              <button
                key={cls.id}
                onClick={() => { setSelectedClass(cls); setViewMode('overview'); }}
                className={`w-full text-left px-4 py-3 rounded-xl transition-colors ${
                  selectedClass?.id === cls.id
                    ? 'bg-accent text-onaccent border border-accent'
                    : 'hover:bg-surface2 text-ink'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${cls.color}`} />
                    <span className="font-medium">{cls.name}</span>
                  </div>
                  <span className="text-xs text-ink3">{cls.students.length} students</span>
                </div>
              </button>
            ))}

            {/* Add New Class Button */}
            <button className="w-full mt-3 rounded-xl border border-dashed border-line bg-transparent px-4 py-3 text-sm text-ink2 hover:border-primary hover:text-primary transition-colors">
              + Create new class
            </button>
          </div>

          {/* Export Section */}
          <div className="p-3 border-t border-line">
            <button
              onClick={() => exportSampleData(selectedClass)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
            >
              <FileText size={14} /> Export Report
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-white">
          {selectedClass ? (
            <ClassDetailView 
              classData={selectedClass} 
              viewMode={viewMode}
              onSetViewMode={setViewMode}
              onClose={onClose}
            />
          ) : (
            <OverviewView />
          )}
        </main>
      </div>
    </div>
  );
}

/**
 * Overview view showing all classes at a glance
 */
function OverviewView() {
  const totalStudents = sampleClasses.reduce((sum, cls) => sum + cls.students.length, 0);
  const avgEngagement = Math.round(sampleClasses.reduce((sum, cls) => sum + cls.avgEngagement, 0) / sampleClasses.length);

  return (
    <div className="p-6 space-y-6">
      <header>
        <h2 className="text-2xl font-bold text-ink">All Classes Overview</h2>
        <p className="mt-1 text-sm text-ink2">Privacy-preserving aggregated metrics</p>
      </header>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard 
          title="Total Students" 
          value={`${totalStudents} students`}
          subtitle="Across all classes"
          icon={Users}
          color="primary"
        />
        <SummaryCard 
          title="Avg Engagement" 
          value={`${avgEngagement}%`}
          subtitle="Weekly active rate"
          icon={TrendingUp}
          color="success"
        />
        <SummaryCard 
          title="Classes Active" 
          value={`${sampleClasses.length} classes`}
          subtitle="This term"
          icon={Clock}
          color="amber"
        />
      </div>

      {/* Class Grid */}
      <h3 className="text-sm font-bold uppercase tracking-wider text-ink2 mt-8">Your Classes</h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {sampleClasses.map(cls => (
          <ClassCard key={cls.id} classData={cls} />
        ))}
      </div>

      {/* Privacy Notice */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-primary/20 p-2">
            <Target size={16} className="text-primary" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-ink">Privacy-Preserving Analytics</h4>
            <p className="mt-1 text-xs text-ink2 leading-relaxed">
              All student data is completely anonymized. You see aggregate progress patterns, not individual names or personal information. 
              This protects student privacy while giving you actionable insights into your class performance.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Summary card component
 */
function SummaryCard({ title, value, subtitle, icon: Icon, color = 'primary' }) {
  const colorClasses = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    amber: 'bg-amber500/10 text-amber500',
  };

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-ink2">{title}</p>
          <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
          <p className="mt-0.5 text-xs text-ink3">{subtitle}</p>
        </div>
        <div className={`rounded-xl p-3 ${colorClasses[color]}`}>
          <Icon size={24} />
        </div>
      </div>
    </div>
  );
}

/**
 * Individual class overview card
 */
function ClassCard({ classData }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 hover:border-ink3/50 transition-colors cursor-pointer">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${classData.color}`} />
          <h3 className="text-lg font-bold text-ink">{classData.name}</h3>
        </div>
        <span className="text-xs text-ink3">{classData.students.length} students</span>
      </div>

      <div className="space-y-3">
        {/* Engagement metric */}
        <div>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-ink2">Weekly engagement</span>
            <span className="font-semibold text-ink">{classData.avgEngagement}%</span>
          </div>
          <div className="h-2 rounded-full bg-surface2 overflow-hidden">
            <div 
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${classData.avgEngagement}%` }}
            />
          </div>
        </div>

        {/* Progress metric */}
        <div>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-ink2">Average proficiency</span>
            <span className="font-semibold text-ink">{classData.avgProficiency} / 100</span>
          </div>
          <div className="h-2 rounded-full bg-surface2 overflow-hidden">
            <div 
              className="h-full rounded-full bg-success transition-all"
              style={{ width: `${classData.avgProficiency}%` }}
            />
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="mt-4 flex gap-2">
        <button className="flex-1 rounded-xl border border-line bg-surface2 px-3 py-2 text-xs font-medium text-ink hover:bg-surface3 transition-colors">
          View Details
        </button>
        <button className="flex-1 rounded-xl border border-line bg-surface2 px-3 py-2 text-xs font-medium text-ink hover:bg-surface3 transition-colors">
          Send Message
        </button>
      </div>
    </div>
  );
}

/**
 * Detailed class view with tabs
 */
function ClassDetailView({ classData, viewMode, onSetViewMode, onClose }) {
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="border-b border-line bg-surface p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${classData.color}`} />
            <h2 className="text-lg font-bold text-ink">{classData.name}</h2>
            <span className="text-xs text-ink3">{classData.students.length} students</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 hover:bg-surface2 transition-colors"
            aria-label="Close dashboard"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation tabs */}
        <nav className="mt-4 flex gap-2">
          <TabButton 
            active={viewMode === 'overview'}
            onClick={() => onSetViewMode('overview')}
            icon={BarChart2}
          >
            Overview
          </TabButton>
          <TabButton 
            active={viewMode === 'details'}
            onClick={() => onSetViewMode('details')}
            icon={Users}
          >
            Student Progress
          </TabButton>
          <TabButton 
            active={viewMode === 'reports'}
            onClick={() => onSetViewMode('reports')}
            icon={FileText}
          >
            Reports
          </TabButton>
        </nav>
      </header>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {viewMode === 'overview' && <ClassOverview classData={classData} />}
        {viewMode === 'details' && <StudentDetails classData={classData} />}
        {viewMode === 'reports' && <ReportsView classData={classData} />}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, children }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
        active 
          ? 'bg-primary text-white' 
          : 'bg-surface2 text-ink hover:bg-surface3'
      }`}
    >
      <Icon size={16} />
      {children}
    </button>
  );
}

function ClassOverview({ classData }) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-ink">Class Overview</h2>
      
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard 
          label="Active Today" 
          value={`${Math.round(classData.students.length * 0.7)} students`}
          trend="+12% this week"
          trendUp={true}
        />
        <MetricCard 
          label="Avg Session Time" 
          value="24 min"
          trend="+5% this week"
          trendUp={true}
        />
        <MetricCard 
          label="Weaknesses Fixed" 
          value={classData.fixedWeaknesses}
          trend="+23% this week"
          trendUp={true}
        />
        <MetricCard 
          label="Pending Reviews" 
          value={classData.pendingReviews}
          trend="-8% from last week"
          trendUp={false}
        />
      </div>

      {/* Activity Chart Placeholder */}
      <div className="rounded-2xl border border-line bg-surface p-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-ink2 mb-4">Class Activity (Last 7 Days)</h3>
        {/* Would integrate actual chart library here */}
        <div className="h-64 rounded-xl bg-surface2 flex items-end justify-between p-4 gap-2">
          {[65, 72, 58, 81, 74, 68, 79].map((height, i) => (
            <div
              key={i}
              className="flex-1 rounded-t bg-primary transition-all hover:bg-primary/90"
              style={{ height: `${height}%` }}
              title={`Day ${i + 1}: ${height}% activity`}
            />
          ))}
        </div>
      </div>

      {/* Top Weaknesses */}
      <div className="rounded-2xl border border-line bg-surface p-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-ink2 mb-4">Most Common Weaknesses</h3>
        <div className="space-y-3">
          {classData.commonWeaknesses.map((weakness, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-ink3 w-4">#{i + 1}</span>
                <span className="text-sm text-ink">{weakness.label}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs text-ink3">{weakness.studentsAffected} students</span>
                <div className="w-32 h-2 rounded-full bg-surface2 overflow-hidden">
                  <div 
                    className="h-full rounded-full bg-amber500"
                    style={{ width: `${(weakness.percentage) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, trend, trendUp }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <p className="text-sm text-ink2">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
      <p className={`mt-1 text-xs ${trendUp ? 'text-success' : 'text-amber500'}`}>
        {trend}
      </p>
    </div>
  );
}

function StudentDetails({ classData }) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-ink">Student Progress (Anonymized)</h2>
      
      <div className="rounded-2xl border border-line bg-surface overflow-hidden">
        <table className="w-full">
          <thead className="bg-surface2">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-ink2">Student ID</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-ink2">Sessions Completed</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-ink2">Avg Accuracy</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-ink2">Weaknesses</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-ink2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {classData.students.map(student => (
              <tr key={student.id} className="hover:bg-surface2/50">
                <td className="px-4 py-3 text-sm text-ink">{student.id}</td>
                <td className="px-4 py-3 text-sm text-ink">{student.sessionsCompleted}</td>
                <td className="px-4 py-3 text-sm text-ink">{student.avgAccuracy}%</td>
                <td className="px-4 py-3 text-sm text-ink">{student.activeWeaknesses}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    student.status === 'active' ? 'bg-success/10 text-success' :
                    student.status === 'at-risk' ? 'bg-amber500/10 text-amber500' :
                    'bg-surface2 text-ink2'
                  }`}>
                    {student.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReportsView({ classData }) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-ink">Progress Reports</h2>
      
      <div className="rounded-2xl border border-line bg-surface p-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-ink2 mb-4">Generate Report</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-2">Report Period</label>
            <select className="w-full rounded-xl border border-line bg-surface2 px-4 py-2.5 text-sm text-ink">
              <option>Last 7 days</option>
              <option>Last 30 days</option>
              <option>This term</option>
              <option>Custom range</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-2">Include</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked className="rounded border-line" />
                <span className="text-sm text-ink">Session completion rates</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked className="rounded border-line" />
                <span className="text-sm text-ink">Weakness improvement trends</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="rounded border-line" />
                <span className="text-sm text-ink">Engagement analytics</span>
              </label>
            </div>
          </div>

          <button
            onClick={() => exportSampleData(classData)}
            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90"
          >
            Generate &amp; Download CSV
          </button>
        </div>
      </div>

      {/* Sample Report Preview */}
      <div className="rounded-2xl border border-line bg-surface p-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-ink2 mb-4">Latest Report</h3>
        <div className="flex items-center justify-between rounded-xl border border-line bg-surface2 p-4">
          <div>
            <p className="text-sm font-semibold text-ink">Termly Progress Report - French GCSE</p>
            <p className="text-xs text-ink2 mt-0.5">A sample report, not one from a real class</p>
          </div>
          <button
            onClick={() => exportSampleData(classData)}
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface3"
          >
            Download
          </button>
        </div>
      </div>
    </div>
  );
}

// Mock data for demonstration
const sampleClasses = [
  {
    id: 'gcse-french-2024',
    name: 'GCSE French 2024',
    color: 'bg-blue-500',
    students: Array.from({ length: 28 }, (_, i) => ({
      id: `STU${String(i + 1).padStart(3, '0')}`,
      sessionsCompleted: Math.floor(Math.random() * 50) + 10,
      avgAccuracy: Math.floor(Math.random() * 40) + 50,
      activeWeaknesses: Math.floor(Math.random() * 5) + 1,
      status: Math.random() > 0.8 ? 'at-risk' : Math.random() > 0.3 ? 'active' : 'completed',
    })),
    avgEngagement: 72,
    avgProficiency: 68,
    fixedWeaknesses: 156,
    pendingReviews: 23,
    commonWeaknesses: [
      { label: 'French R sound (ʁ)', studentsAffected: 18, percentage: 0.64 },
      { label: 'Past tense endings', studentsAffected: 14, percentage: 0.5 },
      { label: 'Nasal vowels (an/en)', studentsAffected: 12, percentage: 0.43 },
      { label: 'Liaison rules', studentsAffected: 10, percentage: 0.36 },
    ],
  },
  {
    id: 'a-level-french-2024',
    name: 'A-Level French',
    color: 'bg-purple-500',
    students: Array.from({ length: 18 }, (_, i) => ({
      id: `AL${String(i + 1).padStart(3, '0')}`,
      sessionsCompleted: Math.floor(Math.random() * 80) + 30,
      avgAccuracy: Math.floor(Math.random() * 30) + 60,
      activeWeaknesses: Math.floor(Math.random() * 4) + 1,
      status: Math.random() > 0.9 ? 'at-risk' : Math.random() > 0.2 ? 'active' : 'completed',
    })),
    avgEngagement: 81,
    avgProficiency: 74,
    fixedWeaknesses: 98,
    pendingReviews: 12,
    commonWeaknesses: [
      { label: 'Complex sentence structures', studentsAffected: 8, percentage: 0.44 },
      { label: 'Formal register vocabulary', studentsAffected: 6, percentage: 0.33 },
      { label: 'Subjunctive mood', studentsAffected: 5, percentage: 0.28 },
    ],
  },
];

// Import X icon for close button
import { X } from './icons';
