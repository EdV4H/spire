import type { GenSpecInput } from "@edv4h/spire-gen";

/**
 * Starting points that each exercise something different. The playground opens
 * on one of these rather than an empty editor: a blank textarea shows nothing
 * about what the SDK does.
 */
export interface Preset {
	id: string;
	label: string;
	/** What this preset is for — shown under the picker. */
	note: string;
	/** Plugins the preset needs. The app enables them when it is loaded. */
	requires: readonly string[];
	spec: GenSpecInput;
}

export const presets: readonly Preset[] = [
	{
		id: "basic",
		label: "基本",
		note: "組み込みルールのみ。始端・終端の既定は1つずつなので、skeleton には何も書かなくてよい。",
		requires: [],
		spec: {
			seed: 42,
			skeleton: { grid: { cols: 5, rows: 12 }, walks: 4 },
			types: {
				distribution: { step: 0.6, gate: 0.25, bonus: 0.15 },
				constraints: [
					{ rule: "fixedRow", row: -1, type: "final" },
					{ rule: "minRow", type: "gate", row: 2 },
					{ rule: "noAdjacentSame", types: ["gate", "bonus"] },
					{ rule: "branchDistinct", exempt: ["final"] },
				],
			},
			populate: null,
		},
	},
	{
		id: "sparse",
		label: "疎（walks=2）",
		note: "ウォークを減らすと分岐のない一本道になる。密度の下限。",
		requires: [],
		spec: {
			seed: 42,
			skeleton: { grid: { cols: 5, rows: 12 }, walks: 2, minStarts: 2 },
			types: {
				distribution: { step: 0.7, gate: 0.3 },
				constraints: [{ rule: "fixedRow", row: -1, type: "final" }],
			},
			populate: null,
		},
	},
	{
		id: "dense",
		label: "密（walks=8）",
		note: "ウォークを増やすと全行が繋がり、分岐が選択の意味を失う。密度の上限。",
		requires: [],
		spec: {
			seed: 42,
			skeleton: { grid: { cols: 5, rows: 12 }, walks: 8, minStarts: 3 },
			types: {
				distribution: { step: 0.6, gate: 0.25, bonus: 0.15 },
				constraints: [{ rule: "fixedRow", row: -1, type: "final" }],
			},
			populate: null,
		},
	},
	{
		id: "many-ends",
		label: "入口も出口も複数",
		note: "既定の逆。minStarts=3 で入口を3つに、maxEnds=null で終端の絞り込みを外す。",
		requires: [],
		spec: {
			seed: 42,
			skeleton: {
				grid: { cols: 5, rows: 12 },
				walks: 6,
				minStarts: 3,
				maxEnds: null,
			},
			types: {
				distribution: { step: 0.6, gate: 0.25, bonus: 0.15 },
				constraints: [
					{ rule: "fixedRow", row: -1, type: "final" },
					{ rule: "minRow", type: "gate", row: 2 },
				],
			},
			populate: null,
		},
	},
	{
		id: "rules-extra",
		label: "追加ルール",
		note: "rules-extra プラグインの maxTotal / rowRange / afterTypes を使う。プラグインを外すと unknown rule で落ちる。",
		requires: ["rules-extra"],
		spec: {
			seed: 7,
			skeleton: { grid: { cols: 5, rows: 12 }, walks: 4, minStarts: 2 },
			types: {
				distribution: { step: 0.6, gate: 0.25, boss: 0.15 },
				constraints: [
					{ rule: "fixedRow", row: -1, type: "final" },
					{ rule: "maxTotal", type: "boss", max: 3 },
					{ rule: "rowRange", type: "gate", minRow: 2, maxRow: -3 },
					{ rule: "afterTypes", type: "boss", after: ["gate"] },
				],
			},
			populate: null,
		},
	},
	{
		id: "populate",
		label: "コンテンツ注入",
		note: "ContentProvider を id で参照する。node.data に入った内容はノードを選ぶと右に出る。",
		requires: [],
		spec: {
			seed: 3,
			skeleton: { grid: { cols: 5, rows: 10 }, walks: 4, minStarts: 2 },
			types: {
				distribution: { step: 0.6, gate: 0.25, bonus: 0.15 },
				constraints: [{ rule: "fixedRow", row: -1, type: "final" }],
			},
			populate: "playground:titles",
		},
	},
	{
		id: "unsatisfiable",
		label: "充足不能",
		note: "矛盾する制約。無限に回らず、どのノードがどのルールに阻まれたかを名指しして止まる。",
		requires: [],
		spec: {
			seed: 1,
			skeleton: { grid: { cols: 4, rows: 6 }, walks: 3, minStarts: 2 },
			types: {
				distribution: { step: 1 },
				constraints: [
					{ rule: "fixedRow", row: 0, type: "alpha" },
					{ rule: "fixedRow", row: 0, type: "beta" },
				],
			},
			populate: null,
		},
	},
];

export const defaultPreset = presets[0] as Preset;
