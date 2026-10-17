// Data for the RoboCasa goal-change figure (assignments 13 and 14 of the
// paper's 54-episode evaluation, configuration 0, goal change, repeat 1).
//
// Sources, all in the paper's supplement:
// - Endpoint values: Figure 1 and Table 4 of the paper.
// - Per-step requirement values (the timelines and the before-change values):
//   analysis/figure-sources/figure1-timeline.csv (sha256 655968e4...).
//   Each interval is [start, end) in actions, exactly where the CSV column is
//   True; nothing is interpolated.
// - Change, receipt and stop steps: analysis/figure-sources/figure1-data.json.
// - Frame crops and object label positions: analysis/plot_paper.py (FRAMES,
//   NEW_TARGET), in source-pixel coordinates of the 256x256 camera frames.
//   The 351x351 PNGs are those crops, enlarged.
import type { ImageMetadata } from 'astro';
import grootBefore from '../../assets/work/robocasa/groot-before-change.png';
import grootEndpoint from '../../assets/work/robocasa/groot-endpoint.png';
import astraBefore from '../../assets/work/robocasa/code-agent-before-change.png';
import astraEndpoint from '../../assets/work/robocasa/code-agent-endpoint.png';

export const HORIZON = 1950;

export type ControllerId = 'groot' | 'astra';
export type MomentId = 'before' | 'endpoint';

export const INSTRUCTIONS = {
  original:
    'From the different types of pastries on the counter, select a croissant and place it on the cutting board. Then retrieve a jar of jam from the cabinet and place it alongside the croissant on the cutting board.',
  revised:
    'Place the croissant back on its original plate. Place the jam on the cutting board. Release the objects and move the gripper away.',
};

export interface Interval {
  start: number;
  end: number; // exclusive
}

export interface Controller {
  id: ControllerId;
  label: string;
  buttonLabel: string;
  assignment: number;
  changeStep: number;
  inputStep: number;
  inputDelay: number;
  inputKind: string;
  delayNote: string;
  endStep: number;
  stop: string;
  headline: string;
  timeline: {
    croissant: Interval[];
    jam: Interval[];
    original: Interval[];
    current: Interval[];
  };
}

export const CONTROLLERS: Record<ControllerId, Controller> = {
  groot: {
    id: 'groot',
    label: 'GR00T N1.5',
    buttonLabel: 'GR00T N1.5',
    assignment: 13,
    changeStep: 244,
    inputStep: 256,
    inputDelay: 12,
    inputKind: 'next policy input',
    delayNote: '12 actions later, at its next 16-action chunk query',
    endStep: 1950,
    stop: 'Ran to the 1,950-action limit.',
    headline: 'Completes the original task, but the croissant is never returned.',
    timeline: {
      croissant: [{ start: 235, end: 244 }],
      jam: [{ start: 716, end: 1950 }],
      original: [{ start: 735, end: 1950 }],
      current: [],
    },
  },
  astra: {
    id: 'astra',
    label: 'Astra (code agent, privileged state)',
    buttonLabel: 'Astra (code agent, privileged state)',
    assignment: 14,
    changeStep: 670,
    inputStep: 1010,
    inputDelay: 340,
    inputKind: 'next model call',
    delayNote:
      '340 actions (17 s of simulated time) later, at its next model call, because the program it had already written kept running',
    endStep: 1891,
    stop: 'The model gave a final answer with 59 actions left.',
    headline: 'Returns the croissant, but the jam never reaches the board.',
    timeline: {
      croissant: [
        { start: 661, end: 670 },
        { start: 1343, end: 1409 },
        { start: 1410, end: 1490 },
        { start: 1491, end: 1571 },
        { start: 1572, end: 1830 },
        { start: 1831, end: 1891 },
      ],
      jam: [],
      original: [],
      current: [],
    },
  },
};

export interface Mark {
  text: string;
  x: number;
  y: number;
  /** Ring radius in source pixels; 0 draws a dot. */
  r: number;
  lx: number;
  ly: number;
}

export interface Requirement {
  target: string;
  met: boolean;
  note: string;
}

export interface GoalState {
  controller: ControllerId;
  moment: MomentId;
  momentLabel: string;
  step: number;
  image: ImageMetadata;
  alt: string;
  frameNote: string;
  goal: 'original' | 'revised';
  croissant: Requirement;
  jam: Requirement;
  originalTask: boolean;
  currentGoal: boolean;
  /** Crop of the 256x256 source frame shown in the image: x0, y0, size. */
  crop: [number, number, number];
  marks: Mark[];
  /** Arrow from the placed croissant to its new target (before the change). */
  arrow?: [[number, number], [number, number]];
}

export const STATES: GoalState[] = [
  {
    controller: 'groot',
    moment: 'before',
    momentLabel: 'Before change',
    step: 240,
    image: grootBefore,
    alt: 'Simulated kitchen, left camera, step 240: the croissant is on the cutting board, the jam jar is still in the upper cabinet and the robot arm is beside the board.',
    frameNote: 'Last policy input before the change.',
    goal: 'original',
    croissant: { target: 'On the cutting board', met: true, note: 'Held since step 235.' },
    jam: { target: 'On the cutting board', met: false, note: 'Still in the cabinet.' },
    originalTask: false,
    currentGoal: false,
    crop: [28, 50, 168],
    marks: [
      { text: 'jam', x: 96, y: 62, r: 10, lx: 62, ly: 66 },
      { text: 'plate', x: 70, y: 153, r: 0, lx: 56, ly: 124 },
      { text: 'board', x: 100, y: 184, r: 0, lx: 60, ly: 206 },
      { text: 'croissant', x: 120, y: 178, r: 12, lx: 160, ly: 206 },
    ],
    arrow: [
      [116, 170],
      [74, 150],
    ],
  },
  {
    controller: 'groot',
    moment: 'endpoint',
    momentLabel: 'Endpoint',
    step: 1950,
    image: grootEndpoint,
    alt: 'GR00T endpoint, step 1,950: the croissant and the jam jar are both on the cutting board. The croissant was not returned to its plate.',
    frameNote: 'Final observation.',
    goal: 'revised',
    croissant: { target: 'Back on its original plate', met: false, note: 'Still on the board.' },
    jam: { target: 'On the cutting board', met: true, note: 'On the board since step 716.' },
    originalTask: true,
    currentGoal: false,
    crop: [36, 88, 144],
    marks: [
      { text: 'plate', x: 88, y: 150, r: 0, lx: 66, ly: 116 },
      { text: 'croissant', x: 111, y: 171, r: 10, lx: 78, ly: 214 },
      { text: 'jam', x: 128, y: 178, r: 10, lx: 150, ly: 214 },
    ],
  },
  {
    controller: 'astra',
    moment: 'before',
    momentLabel: 'Before change',
    step: 655,
    image: astraBefore,
    alt: 'Astra episode, step 655: the croissant is on the cutting board, the jam is in the cabinet and the arm is raised over the counter.',
    frameNote: 'Last model input before the change.',
    goal: 'original',
    croissant: {
      target: 'On the cutting board',
      met: false,
      note: 'On the board but not yet released and settled; holds from step 661.',
    },
    jam: { target: 'On the cutting board', met: false, note: 'Still in the cabinet.' },
    originalTask: false,
    currentGoal: false,
    crop: [34, 48, 164],
    marks: [
      { text: 'jam', x: 106, y: 63, r: 10, lx: 72, ly: 66 },
      { text: 'plate', x: 76, y: 152, r: 0, lx: 62, ly: 124 },
      { text: 'board', x: 152, y: 184, r: 0, lx: 172, ly: 202 },
      { text: 'croissant', x: 126, y: 172, r: 12, lx: 86, ly: 202 },
    ],
    arrow: [
      [121, 165],
      [80, 149],
    ],
  },
  {
    controller: 'astra',
    moment: 'endpoint',
    momentLabel: 'Endpoint',
    step: 1891,
    image: astraEndpoint,
    alt: 'Astra endpoint, step 1,891: the croissant is back on its blue plate, the cutting board is empty and the jam is still in the cabinet.',
    frameNote: 'Last model input; the model then gave its final answer.',
    goal: 'revised',
    croissant: { target: 'Back on its original plate', met: true, note: 'Returned.' },
    jam: { target: 'On the cutting board', met: false, note: 'Never reached the board.' },
    originalTask: false,
    currentGoal: false,
    crop: [22, 44, 164],
    marks: [
      { text: 'jam', x: 98, y: 63, r: 10, lx: 62, ly: 64 },
      { text: 'croissant', x: 69, y: 151, r: 11, lx: 74, ly: 192 },
    ],
  },
];

export const fmt = (n: number) => n.toLocaleString('en-US');
