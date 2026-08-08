// --- 1. データ型の定義（ノートの要件1〜6に対応） ---

export interface Task {
  id: string;
  name: string;          // 2. 達成に必要なこと
  estimatedHours: number; // 3. 必要とされる時間（時間単位）
}

export interface UserCapacity {
  weekdayHours: number; // 5. 平日に使える時間
  weekendHours: number; // 5. 休日に使える時間
}

// 6. 予定があって時間を使えない日（日付文字列: YYYY-MM-DD -> 利用可能時間）
// 例: { '2026-08-10': 0 } （旅行などで完全に使えない日は0時間）
export type BlockedDates = Record<string, number>;

export interface ScheduleInput {
  goalTitle: string;     // 1. 自分の目標
  tasks: Task[];         // 2 & 3. タスク一覧と時間
  startDate: string;     // 4. 開始日 (YYYY-MM-DD)
  deadline: string;      // 4. 締め切り (YYYY-MM-DD)
  capacity: UserCapacity; // 5. 基本キャパシティ
  blockedDates: BlockedDates; // 6. 使えない日・特別日
}

// 出力用：日ごとの割り当て結果（ノートの要件7）
export interface DailySchedule {
  date: string;          // YYYY-MM-DD
  dayOfWeek: string;     // 曜日
  availableHours: number;// その日使えた最大時間
  allocatedHours: number;// 実際に割り当てられた作業時間
  assignedTasks: { taskName: string; hours: number }[]; // 割当タスクの内訳
}

export interface ScheduleResult {
  isPossible: boolean;   // 期限内に終わるかどうか
  totalRequiredHours: number;
  totalAvailableHours: number;
  dailySchedules: DailySchedule[];
  unallocatedHours: number; // 時間が足りず溢れた時間（0なら成功）
}

// --- 2. 逆算スケジューリング関数 ---

export function calculateBackwardSchedule(input: ScheduleInput): ScheduleResult {
  const start = new Date(input.startDate);
  const end = new Date(input.deadline);

  // 日付リスト（開始日〜締め切り日）の作成
  const dateList: Date[] = [];
  let current = new Date(start);
  while (current <= end) {
    dateList.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  // 日ごとのキャパシティマップを初期化
  const scheduleMap = new Map<string, DailySchedule>();
  let totalAvailableHours = 0;

  for (const dateObj of dateList) {
    const dateStr = dateObj.toISOString().split('T')[0];
    const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6; // 0: 日, 6: 土

    // デフォルト時間の判定（平日 or 休日）
    let availableHours = isWeekend ? input.capacity.weekendHours : input.capacity.weekdayHours;

    // 6. 使えない日（blockedDates）の個別指定があれば優先適用
    if (input.blockedDates && input.blockedDates[dateStr] !== undefined) {
      availableHours = input.blockedDates[dateStr];
    }

    const dayOfWeekStr = ['日', '月', '火', '水', '木', '金', '土'][dateObj.getDay()];

    scheduleMap.set(dateStr, {
      date: dateStr,
      dayOfWeek: dayOfWeekStr,
      availableHours,
      allocatedHours: 0,
      assignedTasks: []
    });

    totalAvailableHours += availableHours;
  }

  // 全タスクの必要時間を計算
  const totalRequiredHours = input.tasks.reduce((sum, t) => sum + t.estimatedHours, 0);

  // --- 逆算（バックワード）割り当てロジック ---
  // 締め切り側（日付リストの後ろ）から過去へと順に遡る
  const reversedDates = [...dateList].reverse();

  // タスクも最後のタスクから順に割り当てていく
  const reversedTasks = [...input.tasks].reverse();

  let taskIndex = 0;
  let currentTaskRemainingHours = reversedTasks[0]?.estimatedHours || 0;

  for (const dateObj of reversedDates) {
    if (taskIndex >= reversedTasks.length) break; // 全タスク割当完了

    const dateStr = dateObj.toISOString().split('T')[0];
    const daySchedule = scheduleMap.get(dateStr)!;

    let dayRemainingCapacity = daySchedule.availableHours;

    while (dayRemainingCapacity > 0 && taskIndex < reversedTasks.length) {
      const currentTask = reversedTasks[taskIndex];
      const allocateHours = Math.min(dayRemainingCapacity, currentTaskRemainingHours);

      if (allocateHours > 0) {
        daySchedule.allocatedHours += allocateHours;
        dayRemainingCapacity -= allocateHours;
        currentTaskRemainingHours -= allocateHours;

        // タスクの割当履歴を記録
        daySchedule.assignedTasks.unshift({
          taskName: currentTask.name,
          hours: allocateHours
        });
      }

      // 現タスクが終了したら次のタスクへ
      if (currentTaskRemainingHours <= 0) {
        taskIndex++;
        if (taskIndex < reversedTasks.length) {
          currentTaskRemainingHours = reversedTasks[taskIndex].estimatedHours;
        }
      }
    }
  }

  // 残り未割り当て時間の計算（0より大きければ期限内に終わらない）
  let unallocatedHours = currentTaskRemainingHours;
  for (let i = taskIndex + 1; i < reversedTasks.length; i++) {
    unallocatedHours += reversedTasks[i].estimatedHours;
  }

  const dailySchedules = Array.from(scheduleMap.values());

  return {
    isPossible: unallocatedHours === 0,
    totalRequiredHours,
    totalAvailableHours,
    dailySchedules,
    unallocatedHours
  };
}
// --- 3. テストデータの作成と実行 ---

const sampleInput: ScheduleInput = {
  goalTitle: "自動逆算計画アプリのMVP作成",
  tasks: [
    { id: "1", name: "要件定義・設計", estimatedHours: 4 },
    { id: "2", name: "バックエンド計算ロジック実装", estimatedHours: 6 },
    { id: "3", name: "フロントエンド画面作成", estimatedHours: 10 },
  ],
  startDate: "2026-08-01",
  deadline: "2026-08-07",
  capacity: {
    weekdayHours: 3, // 平日3時間
    weekendHours: 6  // 休日6時間
  },
  blockedDates: {
    "2026-08-05": 0, // 8/5は予定ありで0時間
  }
};

// 計算を実行
const result = calculateBackwardSchedule(sampleInput);

// ターミナルに出力
console.log(`【計算結果】 期限内に達成可能か: ${result.isPossible ? "⭕ 可能" : "❌ 不可能"}`);
console.log(`必要時間: ${result.totalRequiredHours}h / 確保可能時間: ${result.totalAvailableHours}h`);
console.table(result.dailySchedules.map(d => ({
  日付: `${d.date} (${d.dayOfWeek})`,
  利用可能: `${d.availableHours}h`,
  割り当て: `${d.allocatedHours}h`,
  内容: d.assignedTasks.map(t => `${t.taskName}:${t.hours}h`).join(", ")
})));