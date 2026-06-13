import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { chatbotAPI } from '../../services/api';
import {
  MagnifyingGlassIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';

const NODE_W = 220;
const NODE_H = 96;
const GRID = 20;
const PORT_R = 7;

const NODE_META = {
  keyword: { label: 'Reply', color: '#25D366', bg: '#ECFDF5', text: '#047857' },
  flow: { label: 'Flow step', color: '#128C7E', bg: '#ecfdf5', text: '#075E54' },
  fallback: { label: 'Fallback', color: '#F59E0B', bg: '#ecfdf5', text: '#047857' },
};

const STATUS_OPTIONS = [
  { value: '', label: 'No change' },
  { value: 'new', label: 'New' },
  { value: 'interested', label: 'Interested' },
  { value: 'pending', label: 'Pending' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'converted', label: 'Converted' },
  { value: 'follow_up', label: 'Follow Up' },
];

let _uid = 1;
const uid = () => `id_${Date.now()}_${_uid++}`;
const snap = (value) => Math.round(value / GRID) * GRID;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function flowToGraph(flow) {
  if (!flow?.steps?.length) return { nodes: [], edges: [] };
  const normalizedSteps = flow.steps.map((step, index) => {
    const actions = step.options?.length ? step.options : step.actions || [];
    return {
      ...step,
      id: step.id || `step_${index + 1}`,
      question: step.question || step.message || `Step ${index + 1}`,
      fallbackResponse: step.fallbackResponse || flow.settings?.fallbackMessage || 'Please choose one of the available options.',
      inputType: step.inputType || (step.type === 'input' ? 'text' : ''),
      saveAnswerAs: step.saveAnswerAs || step.saveAs || '',
      options: actions.map((action, actionIndex) => ({
        label: action.label || action.title || `Option ${actionIndex + 1}`,
        value: action.value || (action.label || `option_${actionIndex + 1}`).toLowerCase().replace(/[^a-z0-9_]+/g, '_'),
        response: action.response || '',
        addTags: action.addTags || [],
        sendAdmissionInfo: Boolean(action.sendAdmissionInfo),
        setStatus: action.setStatus || '',
        nextStepId: action.nextStepId || action.next || '',
        endFlow: action.endFlow || false,
      })),
      nextStepId: step.nextStepId || '',
    };
  });

  const nodes = normalizedSteps.map((step, index) => ({
    id: step.id,
    type: 'flow',
    x: 80 + (index % 3) * 300,
    y: 80 + Math.floor(index / 3) * 210,
    label: step.question || `Step ${index + 1}`,
    keyword: step.options?.map((option) => option.label).join(' / ') || '',
    response: step.question || '',
    stepData: {
      ...step,
      intents: flow.intents || [],
      settings: flow.settings || {},
    },
    tags: '',
    status: '',
    sendAdmissionInfo: Boolean(step.sendAdmissionInfo),
  }));
  const edges = [];
  normalizedSteps.forEach((step) => {
    (step.options || []).forEach((option) => {
      if (option.nextStepId && !option.endFlow) {
        edges.push({ id: uid(), from: step.id, to: option.nextStepId, label: option.label });
      }
    });
    if ((!step.options || step.options.length === 0) && step.nextStepId) {
      edges.push({ id: uid(), from: step.id, to: step.nextStepId, label: 'Next' });
    }
  });
  return { nodes, edges };
}

function jsonToGraph(payload) {
  if (payload?.welcome_flow && payload?.flows) return flowToGraph(automationConfigToFlow(payload));
  if (payload?.steps?.length) return flowToGraph(payload);

  if (Array.isArray(payload?.nodes)) {
    const importedNodes = payload.nodes.map((node, index) => ({
      id: String(node.id || uid()),
      type: NODE_META[node.type] ? node.type : 'flow',
      x: Number.isFinite(Number(node.x)) ? Number(node.x) : 80 + (index % 3) * 300,
      y: Number.isFinite(Number(node.y)) ? Number(node.y) : 80 + Math.floor(index / 3) * 210,
      label: node.label || node.question || `Step ${index + 1}`,
      keyword: node.keyword || '',
      response: node.response || node.question || '',
      stepData: node.stepData || null,
      tags: node.tags || '',
      status: node.status || '',
      sendAdmissionInfo: Boolean(node.sendAdmissionInfo),
    }));

    const ids = new Set(importedNodes.map((node) => node.id));
    const importedEdges = Array.isArray(payload.edges)
      ? payload.edges
          .filter((edge) => ids.has(String(edge.from)) && ids.has(String(edge.to)))
          .map((edge) => ({
            id: String(edge.id || uid()),
            from: String(edge.from),
            to: String(edge.to),
            label: edge.label || '',
          }))
      : [];

    return { nodes: importedNodes, edges: importedEdges };
  }

  throw new Error('Invalid chatbot flow JSON');
}

function normalizeStepInputType(type = '') {
  const value = String(type || '').toLowerCase();
  if (value === 'input') return 'text';
  if (['text', 'phone', 'email', 'number', 'date'].includes(value)) return value;
  return '';
}

function slugifyId(value = '') {
  return String(value || 'step')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'step';
}

function automationConfigToFlow(config = {}) {
  const steps = [];
  const flowEntries = Object.entries(config.flows || {});
  const firstStepByFlow = new Map();

  flowEntries.forEach(([flowKey, flow]) => {
    const sourceSteps = Array.isArray(flow.steps) ? flow.steps : [];
    if (!sourceSteps.length) return;
    firstStepByFlow.set(flowKey, `${slugifyId(flowKey)}_${slugifyId(sourceSteps[0].id || 'start')}`);
  });

  const welcomeOptions = (config.welcome_flow?.options || []).map((option) => {
    const targetFlow = config.flows?.[option.flow];
    const firstStepId = firstStepByFlow.get(option.flow);
    return {
      label: option.label || option.name || option.id,
      value: slugifyId(option.label || option.name || option.id),
      response: targetFlow?.steps?.length ? (targetFlow.title || option.label || '') : (targetFlow?.message || ''),
      ...(firstStepId ? { nextStepId: firstStepId, endFlow: false } : { endFlow: true }),
      addTags: targetFlow?.actions?.add_tags || targetFlow?.actions?.addTags || [],
      setStatus: targetFlow?.actions?.set_status || targetFlow?.actions?.setStatus || '',
      sendAdmissionInfo: Boolean(targetFlow?.actions?.send_brochure_pdf || targetFlow?.actions?.sendAdmissionInfo),
    };
  });

  steps.push({
    id: 'welcome_menu',
    question: config.welcome_flow?.message || 'Welcome. Please choose an option.',
    options: welcomeOptions,
    fallbackResponse: 'Please choose one of the listed options.'
  });

  flowEntries.forEach(([flowKey, flow]) => {
    const prefix = slugifyId(flowKey);
    const sourceSteps = Array.isArray(flow.steps) ? flow.steps : [];

    if (!sourceSteps.length) return;

    sourceSteps.forEach((sourceStep, index) => {
      const stepId = `${prefix}_${slugifyId(sourceStep.id || `step_${index + 1}`)}`;
      const nextSourceStep = sourceSteps[index + 1];
      const nextStepId = nextSourceStep
        ? `${prefix}_${slugifyId(nextSourceStep.id || `step_${index + 2}`)}`
        : `${prefix}_complete`;
      const inputType = normalizeStepInputType(sourceStep.inputType || sourceStep.type);
      const rawOptions = Array.isArray(sourceStep.options) ? sourceStep.options : [];
      const options = rawOptions.map((item, optionIndex) => {
        const label = typeof item === 'string' ? item : item.label || item.name || `Option ${optionIndex + 1}`;
        return {
          ...(typeof item === 'object' ? item : {}),
          label,
          value: slugifyId(typeof item === 'string' ? item : item.value || label),
          nextStepId,
          endFlow: false
        };
      });

      steps.push({
        id: stepId,
        question: sourceStep.question || sourceStep.message || `Step ${index + 1}`,
        ...(inputType ? { inputType } : {}),
        ...(sourceStep.save_as || sourceStep.saveAs || sourceStep.saveAnswerAs
          ? { saveAnswerAs: sourceStep.save_as || sourceStep.saveAs || sourceStep.saveAnswerAs }
          : {}),
        ...(!options.length ? { nextStepId } : {}),
        options,
        fallbackResponse: inputType === 'phone'
          ? 'Please enter a valid WhatsApp mobile number, for example 9826763101 or +919826763101.'
          : 'Please reply with one of the listed options.'
      });
    });

    steps.push({
      id: `${prefix}_complete`,
      question: flow.completion_message || 'Thank you. Our team will contact you shortly.',
      options: [
        {
          label: 'Back to Menu',
          value: 'menu',
          response: 'Opening main menu.',
          nextStepId: 'welcome_menu',
          endFlow: false,
          addTags: flow.actions?.add_tags || flow.actions?.addTags || [],
          setStatus: flow.actions?.set_status || flow.actions?.setStatus || '',
          sendAdmissionInfo: Boolean(flow.actions?.send_brochure_pdf || flow.actions?.sendAdmissionInfo)
        }
      ],
      fallbackResponse: 'Thank you. Our team will contact you shortly.'
    });
  });

  return {
    startStepId: 'welcome_menu',
    steps
  };
}

export function flowToApiPayload(nodes, edges) {
  const steps = nodes.map((node) => {
    const outEdges = edges.filter((edge) => edge.from === node.id);
    const options = node.stepData?.options?.length
      ? node.stepData.options.map((option) => {
          const edge = outEdges.find((item) => item.label === option.label);
          return {
            ...option,
            ...(edge ? { nextStepId: edge.to, endFlow: false } : { endFlow: true }),
          };
        })
      : outEdges.map((edge, index) => ({
          label: edge.label || `Option ${index + 1}`,
          value: (edge.label || `${index + 1}`).toLowerCase().replace(/[^a-z0-9_]+/g, '_'),
          response: 'Thanks. Our team will contact you shortly.',
          addTags: [],
          setStatus: '',
          nextStepId: edge.to,
          endFlow: false,
        }));

    return {
      id: node.id,
      question: node.label,
      ...(node.stepData?.inputType ? { inputType: node.stepData.inputType } : {}),
      ...(node.stepData?.saveAnswerAs ? { saveAnswerAs: node.stepData.saveAnswerAs } : {}),
      ...(node.stepData?.inputType && outEdges[0]?.to ? { nextStepId: outEdges[0].to } : {}),
      fallbackResponse: node.stepData?.fallbackResponse || 'Please reply with one of the listed options.',
      options,
    };
  });

  return {
    startStepId: nodes[0]?.id || '',
    steps,
  };
}

function getBezier(x1, y1, x2, y2) {
  const dx = Math.abs(x2 - x1);
  const curve = Math.max(70, dx * 0.46);
  return `M${x1},${y1} C${x1 + curve},${y1} ${x2 - curve},${y2} ${x2},${y2}`;
}

function truncate(value, limit) {
  const str = value || '';
  return str.length > limit ? `${str.slice(0, limit - 1)}...` : str;
}

function getBounds(nodes) {
  if (!nodes.length) return { x: 0, y: 0, w: 800, h: 500 };
  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x + NODE_W));
  const maxY = Math.max(...nodes.map((node) => node.y + NODE_H));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

const INTENT_SYNONYMS = {
  admission: ['admission', 'admissions', 'addmission', 'admision', 'admis', 'apply', 'admit', 'dakhila', 'dakila', 'enquiry', 'inquiry', 'interested'],
  fees: ['fee', 'fees', 'school fee', 'school fees', 'feez', 'price', 'pricing', 'cost', 'rate', 'charges', 'paisa', 'kitna', 'batao'],
  counselor: ['counselor', 'counsellor', 'counselling', 'counseling', 'call', 'callback', 'call back', 'contact', 'phone', 'help', 'baat', 'talk'],
  visit: ['visit', 'school visit', 'tour', 'campus', 'book visit', 'appointment', 'meeting', 'milna'],
  hostel: ['hostel', 'boarding', 'hostal'],
  transport: ['transport', 'bus', 'van', 'pickup'],
  class: ['class', 'classes', 'nursery', 'kg', 'primary', 'secondary'],
  menu: ['hi', 'hello', 'hey', 'hii', 'start', 'menu', 'namaste', 'restart'],
};

const normalizeIntentText = (value = '') => String(value)
  .toLowerCase()
  .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const editDistance = (a = '', b = '') => {
  const left = normalizeIntentText(a);
  const right = normalizeIntentText(b);
  if (!left || !right) return Math.max(left.length, right.length);
  const dp = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
  for (let i = 0; i <= left.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[left.length][right.length];
};

const closeMatchScore = (input = '', target = '') => {
  const value = normalizeIntentText(input);
  const keyword = normalizeIntentText(target);
  if (!value || !keyword) return 0;
  if (value === keyword) return 100;
  if (value.includes(keyword) || keyword.includes(value)) return 86;

  const words = value.split(' ').filter(Boolean);
  const targetWords = keyword.split(' ').filter(Boolean);
  let best = 0;
  [...words, value].forEach((word) => {
    [...targetWords, keyword].forEach((targetWord) => {
      const length = Math.max(word.length, targetWord.length, 1);
      const distance = editDistance(word, targetWord);
      const score = Math.max(0, Math.round((1 - distance / length) * 78));
      best = Math.max(best, score);
    });
  });
  return best;
};

const detectIntent = (text = '') => {
  const normalized = normalizeIntentText(text);
  let best = { intent: '', score: 0 };
  Object.entries(INTENT_SYNONYMS).forEach(([intent, words]) => {
    words.forEach((word) => {
      const score = closeMatchScore(normalized, word);
      if (score > best.score) best = { intent, score };
    });
  });
  return best;
};

const optionSearchText = (option = {}) => [
  option.label,
  option.value,
  option.response,
].filter(Boolean).join(' ');

const scoreOption = (text, option, index) => {
  const normalized = normalizeIntentText(text);
  if (String(index + 1) === normalized) return 100;

  const optionText = optionSearchText(option);
  const directScore = Math.max(closeMatchScore(normalized, option.label), closeMatchScore(normalized, option.value), closeMatchScore(normalized, optionText));
  const inputIntent = detectIntent(normalized);
  const optionIntent = detectIntent(optionText);
  const intentScore = inputIntent.intent && inputIntent.intent === optionIntent.intent ? Math.min(96, inputIntent.score + 12) : 0;
  return Math.max(directScore, intentScore);
};

const findBestOption = (text, options = []) => {
  return options.reduce((best, option, index) => {
    const score = scoreOption(text, option, index);
    return score > best.score ? { option, index, score } : best;
  }, { option: null, index: -1, score: 0 });
};

const ruleToGraph = (rule) => {
  if (rule?.flow?.steps?.length) {
    const graph = flowToGraph(rule.flow);
    if (graph.nodes[0]) {
      graph.nodes[0] = {
        ...graph.nodes[0],
        label: rule.title || graph.nodes[0].label,
        keyword: rule.keyword || graph.nodes[0].keyword,
        response: rule.response || graph.nodes[0].response,
        tags: (rule.actions?.addTags || []).join(', '),
        status: rule.actions?.setStatus || '',
        sendAdmissionInfo: Boolean(rule.actions?.sendAdmissionInfo),
      };
    }
    return graph;
  }
  const node = {
    id: uid(),
    type: rule?.isFallback ? 'fallback' : 'keyword',
    x: 120,
    y: 160,
    label: rule?.title || rule?.keyword || 'Automation rule',
    keyword: rule?.keyword || '',
    response: rule?.response || rule?.fallbackMessage || '',
    tags: (rule?.actions?.addTags || []).join(', '),
    status: rule?.actions?.setStatus || '',
    sendAdmissionInfo: Boolean(rule?.actions?.sendAdmissionInfo),
  };
  return { nodes: [node], edges: [] };
};

const normalizeTriggerKeyword = (value = '') => {
  const first = String(value)
    .split(',')
    .map((item) => item.trim())
    .find(Boolean) || '';
  return first
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const createRulePayload = (nodes, edges, existingKeyword = '') => {
  const startNode = nodes[0];
  const flow = flowToApiPayload(nodes, edges);
  const keywordSource = startNode?.type === 'keyword'
    ? startNode?.keyword
    : existingKeyword || startNode?.keyword;
  const rawKeyword = normalizeTriggerKeyword(keywordSource);
  const keyword = rawKeyword && rawKeyword !== '__fallback__' ? rawKeyword : 'hi';
  const fallbackNode = nodes.find((node) => node.type === 'fallback');
  const quickReplies = edges
    .filter((edge) => edge.from === startNode?.id)
    .map((edge) => ({ label: edge.label || 'Continue', value: (edge.label || 'continue').toLowerCase().replace(/[^a-z0-9_]+/g, '_') }));

  return {
    keyword,
    ruleType: 'flow',
    title: startNode?.label || 'WhatsApp automation flow',
    response: startNode?.response || startNode?.label || 'Please choose an option.',
    responseType: 'text',
    quickReplies,
    actions: {
      addTags: String(startNode?.tags || '').split(',').map((item) => item.trim()).filter(Boolean),
      setStatus: startNode?.status || undefined,
      sendAdmissionInfo: Boolean(startNode?.sendAdmissionInfo),
    },
    flow,
    matchType: 'contains',
    isFallback: false,
    fallbackMessage: fallbackNode?.response || 'Sorry, I did not understand. Please choose one of the available options.',
    priority: 10,
    isActive: true,
  };
};

const enrichedOptionResponse = (option) => {
  const intent = detectIntent(optionSearchText(option)).intent;
  if (intent === 'admission' && String(option.response || '').length < 80) {
    return 'Admission Open 2026\n- Nursery to Class 10\n- CBSE Curriculum\n- Smart Classes\n- Hostel Facility Available\n\nChoose an option below to continue.';
  }
  if (intent === 'fees' && String(option.response || '').length < 80) {
    return 'Fee details are available for admission, transport, and hostel facilities.\n\nChoose the fee category you want to check.';
  }
  if (intent === 'counselor' && String(option.response || '').length < 80) {
    return 'Our counselor can help with admission, fees, school visit, and eligibility details.\n\nPlease share your contact details to continue.';
  }
  if (intent === 'visit' && String(option.response || '').length < 80) {
    return 'You can book a school visit and meet our admission team.\n\nPlease choose your preferred visit slot.';
  }
  return option.response || '';
};

const getCustomIntentOptions = (nodes, text) => {
  const normalized = normalizeIntentText(text);
  const candidates = [];
  nodes.forEach((node) => {
    (node.stepData?.intents || []).forEach((intent) => {
      const bestKeywordScore = (intent.keywords || []).reduce((best, keyword) => Math.max(best, closeMatchScore(normalized, keyword)), 0);
      if (bestKeywordScore >= 68 && intent.nextStepId) {
        candidates.push({
          label: intent.intent || intent.keywords?.[0] || 'Continue',
          value: intent.intent || '',
          nextStepId: intent.nextStepId,
          response: '',
          matchScore: bestKeywordScore,
        });
      }
    });
  });
  candidates.sort((a, b) => b.matchScore - a.matchScore);
  return candidates[0] || null;
};

function NodeCard({ node, selected, multiSelected, onMouseDown, onPortMouseDown, onPortMouseUp }) {
  const meta = NODE_META[node.type] || NODE_META.flow;
  const ring = selected || multiSelected;

  return (
    <g transform={`translate(${node.x},${node.y})`} style={{ cursor: 'grab', userSelect: 'none' }} onMouseDown={(event) => onMouseDown(event, node.id)}>
      <rect x={7} y={9} width={NODE_W} height={NODE_H} rx={18} fill="rgba(7,94,84,0.13)" />
      <rect width={NODE_W} height={NODE_H} rx={18} fill="#fff" stroke={ring ? meta.color : '#dbe4ef'} strokeWidth={ring ? 2.6 : 1.2} />
      <rect width={NODE_W} height={6} rx={6} fill={meta.color} />
      <rect x={0} y={2} width={NODE_W} height={6} fill={meta.color} />

      <rect x={12} y={15} width={82} height={22} rx={9} fill={meta.bg} />
      <text x={53} y={26} textAnchor="middle" dominantBaseline="central" fontSize={9} fontWeight={800} fill={meta.text} letterSpacing={0.5}>
        {meta.label.toUpperCase()}
      </text>

      <text x={12} y={52} dominantBaseline="central" fontSize={14} fontWeight={850} fill="#0f172a">
        {truncate(node.label, 24)}
      </text>
      <text x={12} y={74} dominantBaseline="central" fontSize={11} fill="#64748b">
        {truncate(node.keyword || node.response, 32)}
      </text>

      <circle cx={NODE_W} cy={NODE_H / 2} r={PORT_R} fill="#fff" stroke={meta.color} strokeWidth={2.4} style={{ cursor: 'crosshair' }} onMouseDown={(event) => { event.stopPropagation(); onPortMouseDown(event, node.id, 'out'); }} />
      <circle cx={0} cy={NODE_H / 2} r={PORT_R} fill="#fff" stroke={meta.color} strokeWidth={2.4} style={{ cursor: 'crosshair' }} onMouseDown={(event) => { event.stopPropagation(); onPortMouseDown(event, node.id, 'in'); }} onMouseUp={(event) => { event.stopPropagation(); onPortMouseUp(event, node.id); }} />
    </g>
  );
}

function Edge({ edge, nodes, selected, onClick }) {
  const from = nodes.find((node) => node.id === edge.from);
  const to = nodes.find((node) => node.id === edge.to);
  if (!from || !to) return null;

  const x1 = from.x + NODE_W;
  const y1 = from.y + NODE_H / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_H / 2;
  const d = getBezier(x1, y1, x2, y2);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;

  return (
    <g onClick={(event) => { event.stopPropagation(); onClick(edge.id); }} style={{ cursor: 'pointer' }}>
      <path d={d} fill="none" stroke="transparent" strokeWidth={16} />
      <path d={d} fill="none" stroke={selected ? '#25D366' : '#94a3b8'} strokeWidth={selected ? 2.6 : 1.8} markerEnd={selected ? 'url(#arr-selected)' : 'url(#arr)'} />
      {edge.label && (
        <g>
          <rect x={mx - 38} y={my - 13} width={76} height={26} rx={9} fill="#fff" stroke="#dbe4ef" />
          <text x={mx} y={my} textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={800} fill="#128C7E">
            {truncate(edge.label, 12)}
          </text>
        </g>
      )}
    </g>
  );
}

function Toolbar({ onAdd, onDelete, onClear, onLoadDemo, onExport, onImport, onFit, onUndo, onRedo, onSave, saving, selectedCount, canUndo, canRedo }) {
  const button = (label, onClick, tone = 'default', disabled = false) => (
    <button type="button" onClick={onClick} disabled={disabled} className={`chatbot-tool ${tone}`}>
      {label}
    </button>
  );

  return (
    <div className="chatbot-toolbar">
      <div className="chatbot-toolbar-title">Chatbot Flow Builder</div>
      <span className="chatbot-sep" />
      {button('+ Reply', () => onAdd('keyword'))}
      {button('+ Flow Step', () => onAdd('flow'))}
      {button('+ Fallback', () => onAdd('fallback'))}
      <span className="chatbot-sep" />
      {button('Undo', onUndo, 'default', !canUndo)}
      {button('Redo', onRedo, 'default', !canRedo)}
      {button('Fit', onFit)}
      {selectedCount > 0 && button(`Delete (${selectedCount})`, onDelete, 'danger')}
      {button('Clear', onClear)}
      <span className="chatbot-sep" />
      {button('Load demo', onLoadDemo)}
      {button(saving ? 'Saving...' : 'Save to DB', onSave, 'accent', saving)}
      {button('Import JSON', onImport)}
      {button('Export JSON', onExport, 'accent')}
    </div>
  );
}

function PropPanel({ node, edge, nodes, onChange, onDelete, onClose, onEdgeLabelChange }) {
  if (!node && !edge) return null;
  const stopPanelEvent = (event) => event.stopPropagation();

  if (edge) {
    const from = nodes.find((item) => item.id === edge.from);
    const to = nodes.find((item) => item.id === edge.to);
    return (
      <div className="chatbot-panel" onMouseDown={stopPanelEvent} onClick={stopPanelEvent} onWheel={stopPanelEvent}>
        <div className="chatbot-panel-head"><b>Connection</b><button type="button" onClick={onClose}>x</button></div>
        <p>{from?.label || 'Start'} to {to?.label || 'Next'}</p>
        <label>Option label<input value={edge.label || ''} onChange={(event) => onEdgeLabelChange(edge.id, event.target.value)} placeholder="Admission, Fees, Yes" /></label>
        <button type="button" className="chatbot-delete" onClick={() => onDelete('edge', edge.id)}>Delete connection</button>
      </div>
    );
  }

  return (
    <div className="chatbot-panel" onMouseDown={stopPanelEvent} onClick={stopPanelEvent} onWheel={stopPanelEvent}>
      <div className="chatbot-panel-head"><b>{NODE_META[node.type]?.label || 'Node'}</b><button type="button" onClick={onClose}>x</button></div>
      <div className="chatbot-type-row">
        {Object.keys(NODE_META).map((type) => (
          <button type="button" key={type} className={node.type === type ? 'active' : ''} onClick={() => onChange(node.id, 'type', type)}>
            {NODE_META[type].label}
          </button>
        ))}
      </div>
      <label>Node title<input value={node.label || ''} onChange={(event) => onChange(node.id, 'label', event.target.value)} /></label>
      <label>Keyword / trigger<input value={node.keyword || ''} onChange={(event) => onChange(node.id, 'keyword', event.target.value)} placeholder="admission, fees, hi" /></label>
      <label>Response message<textarea value={node.response || ''} onChange={(event) => onChange(node.id, 'response', event.target.value)} placeholder="Bot reply when this node is reached" /></label>
      <label>Tags<input value={node.tags || ''} onChange={(event) => onChange(node.id, 'tags', event.target.value)} placeholder="Admission Interested, Lead" /></label>
      <label>Lead status<select value={node.status || ''} onChange={(event) => onChange(node.id, 'status', event.target.value)}>{STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
      <label className="chatbot-checkline">
        <input type="checkbox" checked={Boolean(node.sendAdmissionInfo)} onChange={(event) => onChange(node.id, 'sendAdmissionInfo', event.target.checked)} />
        <span>Send admission info pack</span>
      </label>
      <button type="button" className="chatbot-delete" onClick={() => onDelete('node', node.id)}>Delete node</button>
    </div>
  );
}

function MiniMap({ nodes, edges, viewBox, canvasW, canvasH, onJump }) {
  const scale = 150 / canvasW;
  const h = Math.max(78, canvasH * scale);
  return (
    <button type="button" className="chatbot-minimap" onClick={onJump}>
      <svg width={150} height={h}>
        {edges.map((edge) => {
          const from = nodes.find((node) => node.id === edge.from);
          const to = nodes.find((node) => node.id === edge.to);
          if (!from || !to) return null;
          return <line key={edge.id} x1={(from.x + NODE_W) * scale} y1={(from.y + NODE_H / 2) * scale} x2={to.x * scale} y2={(to.y + NODE_H / 2) * scale} stroke="#b8c8df" strokeWidth={1} />;
        })}
        {nodes.map((node) => {
          const meta = NODE_META[node.type] || NODE_META.flow;
          return <rect key={node.id} x={node.x * scale} y={node.y * scale} width={NODE_W * scale} height={NODE_H * scale} rx={4} fill={meta.bg} stroke={meta.color} strokeWidth={0.7} />;
        })}
        <rect x={viewBox.x * scale} y={viewBox.y * scale} width={viewBox.w * scale} height={viewBox.h * scale} rx={4} fill="none" stroke="#128C7E" strokeWidth={1.6} />
      </svg>
    </button>
  );
}

function MobilePreview({ nodes, edges, selectedNodeId }) {
  const getStartNode = useCallback(() => nodes[0] || null, [nodes]);
  const getNodeText = (node) => node?.response || node?.label || 'Hi! Send a message to test this automation.';
  const getNodeOptions = useCallback((node) => {
    if (!node) return [];
    const stepOptions = node.stepData?.options || [];
    if (stepOptions.length) return stepOptions;
    return edges.filter((edge) => edge.from === node.id).map((edge, index) => ({
      label: edge.label || `Option ${index + 1}`,
      value: edge.label || `${index + 1}`,
      nextStepId: edge.to,
      response: '',
    }));
  }, [edges]);
  const [currentStepId, setCurrentStepId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('hi');
  const [typing, setTyping] = useState(false);

  const currentNode = useMemo(() => {
    return nodes.find((node) => node.id === currentStepId) || getStartNode();
  }, [currentStepId, getStartNode, nodes]);

  const quickReplies = useMemo(() => {
    return getNodeOptions(currentNode).map((option) => option.label || option.value || 'Next');
  }, [currentNode, getNodeOptions]);

  const resetPreview = useCallback(() => {
    const start = getStartNode();
    setCurrentStepId(start?.id || null);
    setMessages(start ? [{ role: 'bot', text: getNodeText(start), actions: getNodeOptions(start) }] : [{ role: 'bot', text: 'Import or create a flow to test it here.' }]);
    setInput('hi');
    setTyping(false);
  }, [getNodeOptions, getStartNode]);

  useEffect(() => {
    const start = nodes[0] || null;
    setCurrentStepId(start?.id || null);
    setMessages(start ? [{ role: 'bot', text: getNodeText(start), actions: getNodeOptions(start) }] : [{ role: 'bot', text: 'Import or create a flow to test it here.' }]);
    setInput('hi');
    setTyping(false);
  }, [getNodeOptions, nodes.length]);

  const findOption = useCallback((node, text) => {
    const localMatch = findBestOption(text, getNodeOptions(node));
    if (localMatch.score >= 68) return { ...localMatch.option, matchScore: localMatch.score };

    const customIntent = getCustomIntentOptions(nodes, text);
    if (customIntent?.matchScore >= 68) return customIntent;

    const start = getStartNode();
    if (start && start.id !== node?.id) {
      const globalMatch = findBestOption(text, getNodeOptions(start));
      if (globalMatch.score >= 82) return { ...globalMatch.option, matchScore: globalMatch.score };
      if (globalMatch.score >= 52) return { suggestion: globalMatch.option, matchScore: globalMatch.score };
    }

    if (localMatch.score >= 48) return { suggestion: localMatch.option, matchScore: localMatch.score };
    return null;
  }, [getNodeOptions, getStartNode, nodes]);

  const sendMessage = (value = input) => {
    const text = String(value || '').trim();
    if (!text) return;
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setInput('');
    setTyping(true);
    window.setTimeout(() => {
      const activeNode = currentNode || getStartNode();
      const option = findOption(activeNode, text);
      if (option?.suggestion) {
        setMessages((prev) => [...prev, {
          role: 'bot',
          text: `Did you mean "${option.suggestion.label || option.suggestion.value}"?`,
          actions: [option.suggestion],
        }]);
        setTyping(false);
        return;
      }

      const nextId = option?.nextStepId || (!getNodeOptions(activeNode).length ? activeNode?.stepData?.nextStepId : '');
      const nextNode = nodes.find((node) => node.id === nextId);
      const nextMessages = [];

      if (option) {
        const optionResponse = enrichedOptionResponse(option);
        if (optionResponse) nextMessages.push({ role: 'bot', text: optionResponse });
        if (nextNode) nextMessages.push({ role: 'bot', text: getNodeText(nextNode), actions: getNodeOptions(nextNode) });
        setCurrentStepId(nextNode?.id || activeNode?.id || null);
      } else if (activeNode?.stepData?.inputType && nextNode) {
        nextMessages.push({ role: 'bot', text: getNodeText(nextNode), actions: getNodeOptions(nextNode) });
        setCurrentStepId(nextNode.id);
      } else {
        nextMessages.push({
          role: 'bot',
          text: activeNode?.stepData?.fallbackResponse || 'Please choose one of the available options.',
          actions: getNodeOptions(activeNode),
        });
      }

      setMessages((prev) => [...prev, ...nextMessages]);
      setTyping(false);
    }, 520);
  };

  return (
    <aside className="chatbot-preview">
      <div className="chatbot-preview-head">
        <div><span>Live mobile preview</span><b>WhatsApp test chat</b></div>
        <button type="button" onClick={resetPreview}>Reset</button>
      </div>
      <div className="chatbot-phone">
        <div className="chatbot-phone-screen">
          <div className="chatbot-notch" />
          <div className="chatbot-wa-top">
            <span>‹</span>
            <div className="chatbot-avatar">W</div>
            <div><b>WaAuto</b><small>Business account</small></div>
            <em>⋮</em>
          </div>
          <div className="chatbot-chat">
            <div className="chatbot-date">Today</div>
            {messages.map((message, index) => (
              <div key={index} className={`chatbot-bubble ${message.role}`}>
                {message.text}
                {!!message.actions?.length && (
                  <div className="chatbot-inline-actions">
                    {message.actions.slice(0, 8).map((action) => (
                      <button type="button" key={`${index}-${action.label || action.value}`} onClick={() => sendMessage(action.label || action.value)}>
                        {action.label || action.value}
                      </button>
                    ))}
                  </div>
                )}
                <small>10:58</small>
              </div>
            ))}
            {typing && <div className="chatbot-typing"><span /><span /><span /></div>}
          </div>
          {!!quickReplies.length && (
            <div className="chatbot-quick">
              {quickReplies.slice(0, 8).map((reply) => <button type="button" key={reply} onClick={() => sendMessage(reply)}>{reply}</button>)}
            </div>
          )}
          <div className="chatbot-compose">
            <button type="button">+</button>
            <input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') sendMessage(); }} placeholder="Message" />
            <button type="button" onClick={() => sendMessage()}>➤</button>
          </div>
          <div className="chatbot-nav"><span>‹</span><span>○</span><span>□</span></div>
        </div>
      </div>
    </aside>
  );
}

export default function FlowBuilder({ initialFlow, onChange, readOnly = false }) {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState([]);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [spaceDown, setSpaceDown] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [previewWidth, setPreviewWidth] = useState(400);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [rules, setRules] = useState([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [ruleSearch, setRuleSearch] = useState('');
  const [selectedRuleId, setSelectedRuleId] = useState(null);
  const [selectedRuleKeyword, setSelectedRuleKeyword] = useState('');
  const [savingRule, setSavingRule] = useState(false);

  const draggingNode = useRef(null);
  const dragStart = useRef(null);
  const nodeStartPos = useRef(null);
  const pendingNodeClick = useRef(null);
  const nodeDragMoved = useRef(false);
  const connectingFrom = useRef(null);
  const [draftEdge, setDraftEdge] = useState(null);
  const panning = useRef(false);
  const panStart = useRef(null);
  const resizeStart = useRef(null);
  const rafRef = useRef(null);
  const svgRef = useRef(null);
  const wrapRef = useRef(null);
  const importInputRef = useRef(null);

  const canvasW = 2400;
  const canvasH = 1600;
  const selectedCount = selectedNodeIds.length + (selectedEdgeId ? 1 : 0);
  const filteredRules = useMemo(() => {
    const query = ruleSearch.trim().toLowerCase();
    if (!query) return rules;
    return rules.filter((rule) => [
      rule.title,
      rule.keyword,
      rule.response,
      rule.ruleType,
      rule.isActive ? 'active' : 'inactive',
      ...(rule.flow?.steps || []).flatMap((step) => [step.question, ...(step.options || []).flatMap((option) => [option.label, option.response])]),
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(query)));
  }, [ruleSearch, rules]);

  const fetchRules = useCallback(async () => {
    setRulesLoading(true);
    try {
      const response = await chatbotAPI.getRules();
      setRules(response.data?.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Automation rules load nahi ho paaye');
    } finally {
      setRulesLoading(false);
    }
  }, []);

  const pushHistory = useCallback((nextNodes = nodes, nextEdges = edges) => {
    setHistory((prev) => [...prev.slice(-39), { nodes, edges }]);
    setFuture([]);
    setNodes(nextNodes);
    setEdges(nextEdges);
  }, [edges, nodes]);

  const loadDemo = useCallback(() => {
    const a = { id: uid(), type: 'keyword', x: 80, y: 180, label: 'Welcome / Hi', keyword: 'hi, hello, namaste', response: 'Welcome! Choose an option:\n1. Admission\n2. Fees\n3. Counselor', tags: '', status: '' };
    const b = { id: uid(), type: 'flow', x: 400, y: 80, label: 'Admission flow', keyword: 'admission, interested', response: 'Are you interested in admission?', tags: 'Admission Interested', status: 'interested', sendAdmissionInfo: true };
    const c = { id: uid(), type: 'keyword', x: 400, y: 300, label: 'Fees reply', keyword: 'fees, price, cost', response: 'Fees info at {{2}}\nReply counselor for callback.', tags: 'Fees Requested', status: 'pending' };
    const d = { id: uid(), type: 'flow', x: 740, y: 80, label: 'Ask class', keyword: 'yes / 1', response: 'Which class are you interested in?', tags: '', status: '' };
    const e = { id: uid(), type: 'keyword', x: 740, y: 300, label: 'Counselor callback', keyword: 'counselor, call', response: 'Callback requested. Our counselor will contact you soon.', tags: 'Counselor Requested', status: 'follow_up' };
    const f = { id: uid(), type: 'fallback', x: 80, y: 430, label: 'Fallback', keyword: '__fallback__', response: 'Sorry, choose:\n1. Admission\n2. Fees\n3. Counselor', tags: '', status: '' };
    const ns = [a, b, c, d, e, f];
    const es = [
      { id: uid(), from: a.id, to: b.id, label: 'Admission' },
      { id: uid(), from: a.id, to: c.id, label: 'Fees' },
      { id: uid(), from: a.id, to: e.id, label: 'Counselor' },
      { id: uid(), from: b.id, to: d.id, label: 'Yes' },
    ];
    setNodes(ns);
    setEdges(es);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setSelectedNodeIds([]);
    setSelectedRuleId(null);
    setSelectedRuleKeyword('');
    window.setTimeout(() => fitView(ns), 40);
  }, []);

  useEffect(() => {
    fetchRules();
    if (initialFlow) {
      const graph = flowToGraph(initialFlow);
      setNodes(graph.nodes);
      setEdges(graph.edges);
    } else {
      loadDemo();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    onChange?.(flowToApiPayload(nodes, edges));
  }, [nodes, edges]); // eslint-disable-line react-hooks/exhaustive-deps

  const getSvgPoint = useCallback((clientX, clientY) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom,
    };
  }, [pan, zoom]);

  const fitView = useCallback((items = nodes) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || !items.length) return;
    const bounds = getBounds(items);
    const padding = 120;
    const nextZoom = clamp(Math.min((rect.width - padding) / bounds.w, (rect.height - padding) / bounds.h), 0.35, 1.25);
    setZoom(nextZoom);
    setPan({
      x: rect.width / 2 - (bounds.x + bounds.w / 2) * nextZoom,
      y: rect.height / 2 - (bounds.y + bounds.h / 2) * nextZoom,
    });
  }, [nodes]);

  const addNode = useCallback((type, atPoint = null) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    const pt = atPoint || getSvgPoint((rect?.left || 0) + 240, (rect?.top || 0) + 200);
    const node = {
      id: uid(),
      type,
      x: snap(pt.x),
      y: snap(pt.y),
      label: type === 'keyword' ? 'New reply' : type === 'flow' ? 'New flow step' : 'Fallback',
      keyword: type === 'keyword' ? 'keyword' : type === 'fallback' ? '__fallback__' : 'yes / 1',
      response: type === 'fallback' ? 'Sorry, I did not understand. Please choose one of the options.' : '',
      tags: '',
      status: '',
      sendAdmissionInfo: false,
    };
    pushHistory([...nodes, node], edges);
    setSelectedNodeId(node.id);
    setSelectedNodeIds([node.id]);
    setSelectedEdgeId(null);
    setContextMenu(null);
  }, [edges, getSvgPoint, nodes, pushHistory]);

  const updateNodeField = useCallback((id, field, value) => {
    setNodes((prev) => prev.map((node) => node.id === id ? { ...node, [field]: value } : node));
  }, []);

  const deleteSelected = useCallback(() => {
    const ids = selectedNodeIds.length ? selectedNodeIds : selectedNodeId ? [selectedNodeId] : [];
    if (ids.length) {
      pushHistory(nodes.filter((node) => !ids.includes(node.id)), edges.filter((edge) => !ids.includes(edge.from) && !ids.includes(edge.to)));
      setSelectedNodeId(null);
      setSelectedNodeIds([]);
    } else if (selectedEdgeId) {
      pushHistory(nodes, edges.filter((edge) => edge.id !== selectedEdgeId));
      setSelectedEdgeId(null);
    }
  }, [edges, nodes, pushHistory, selectedEdgeId, selectedNodeId, selectedNodeIds]);

  const deleteItem = useCallback((kind, id) => {
    if (kind === 'node') {
      pushHistory(nodes.filter((node) => node.id !== id), edges.filter((edge) => edge.from !== id && edge.to !== id));
      setSelectedNodeId(null);
      setSelectedNodeIds([]);
    } else {
      pushHistory(nodes, edges.filter((edge) => edge.id !== id));
      setSelectedEdgeId(null);
    }
  }, [edges, nodes, pushHistory]);

  const clearAll = () => {
    pushHistory([], []);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setSelectedNodeIds([]);
    setSelectedRuleId(null);
    setSelectedRuleKeyword('');
  };

  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setFuture((items) => [{ nodes, edges }, ...items].slice(0, 40));
    setHistory((items) => items.slice(0, -1));
    setNodes(prev.nodes);
    setEdges(prev.edges);
  };

  const redo = () => {
    const next = future[0];
    if (!next) return;
    setHistory((items) => [...items, { nodes, edges }].slice(-40));
    setFuture((items) => items.slice(1));
    setNodes(next.nodes);
    setEdges(next.edges);
  };

  const exportJSON = () => {
    const payload = flowToApiPayload(nodes, edges);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'chatbot-flow.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const loadRule = (rule) => {
    try {
      const graph = ruleToGraph(rule);
      pushHistory(graph.nodes, graph.edges);
      setSelectedRuleId(rule._id);
      setSelectedRuleKeyword(rule.keyword || '');
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setSelectedNodeIds([]);
      window.setTimeout(() => fitView(graph.nodes), 40);
      toast.success('Automation loaded from database');
    } catch (error) {
      toast.error(error.message || 'Automation load failed');
    }
  };

  const deleteRule = async (rule) => {
    if (!rule?._id) return;
    const label = rule.title || rule.keyword || 'this automation';
    if (!window.confirm(`Delete automation "${label}" from database?`)) return;

    try {
      await chatbotAPI.deleteRule(rule._id);
      setRules((current) => current.filter((item) => item._id !== rule._id));
      if (selectedRuleId === rule._id) {
        setSelectedRuleId(null);
        setSelectedRuleKeyword('');
      }
      toast.success('Automation deleted');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Automation delete failed');
    }
  };

  const saveRule = async () => {
    if (!nodes.length) {
      toast.error('Save karne ke liye at least one node add karo');
      return;
    }
    setSavingRule(true);
    try {
      const payload = createRulePayload(nodes, edges, selectedRuleKeyword);
      const duplicateRule = !selectedRuleId
        ? rules.find((rule) => String(rule.keyword || '').toLowerCase() === payload.keyword)
        : null;
      const targetRuleId = selectedRuleId || duplicateRule?._id;
      const response = targetRuleId
        ? await chatbotAPI.updateRule(targetRuleId, payload)
        : await chatbotAPI.createRule(payload);
      setSelectedRuleId(response.data?.data?._id || targetRuleId);
      setSelectedRuleKeyword(response.data?.data?.keyword || selectedRuleKeyword || payload.keyword);
      await fetchRules();
      toast.success(targetRuleId ? 'Automation updated in database' : 'Automation saved in database');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Automation save failed');
    } finally {
      setSavingRule(false);
    }
  };

  const importJSON = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const graph = jsonToGraph(JSON.parse(text));
      if (!graph.nodes.length) throw new Error('No nodes found');
      pushHistory(graph.nodes, graph.edges);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setSelectedNodeIds([]);
      setContextMenu(null);
      window.setTimeout(() => fitView(graph.nodes), 40);
    } catch (error) {
      window.alert(`Import failed: ${error.message || 'Invalid JSON file'}`);
    }
  };

  const onNodeMouseDown = useCallback((event, id) => {
    if (readOnly) return;
    event.stopPropagation();
    const pt = getSvgPoint(event.clientX, event.clientY);
    draggingNode.current = id;
    dragStart.current = pt;
    pendingNodeClick.current = { id, x: event.clientX, y: event.clientY };
    nodeDragMoved.current = false;
    nodeStartPos.current = new Map(nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
    const nextSelection = event.shiftKey
      ? (selectedNodeIds.includes(id) ? selectedNodeIds.filter((item) => item !== id) : [...selectedNodeIds, id])
      : selectedNodeIds.includes(id) ? selectedNodeIds : [id];
    setSelectedNodeIds(nextSelection);
    setSelectedEdgeId(null);
    setContextMenu(null);
  }, [getSvgPoint, nodes, readOnly, selectedNodeIds]);

  const onPortMouseDown = useCallback((event, id, side) => {
    if (readOnly) return;
    event.stopPropagation();
    const node = nodes.find((item) => item.id === id);
    if (!node) return;
    connectingFrom.current = { id, side };
    const px = node.x + (side === 'out' ? NODE_W : 0);
    const py = node.y + NODE_H / 2;
    setDraftEdge({ x1: px, y1: py, x2: px, y2: py });
  }, [nodes, readOnly]);

  const onPortMouseUp = useCallback((event, toId) => {
    if (!connectingFrom.current) return;
    const { id: fromId, side } = connectingFrom.current;
    if (fromId === toId) {
      connectingFrom.current = null;
      setDraftEdge(null);
      return;
    }
    const from = side === 'out' ? fromId : toId;
    const to = side === 'out' ? toId : fromId;
    if (!edges.some((edge) => edge.from === from && edge.to === to)) {
      pushHistory(nodes, [...edges, { id: uid(), from, to, label: '' }]);
    }
    connectingFrom.current = null;
    setDraftEdge(null);
  }, [edges, nodes, pushHistory]);

  const onPointerMove = useCallback((event) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if (resizeStart.current) {
        const dx = resizeStart.current.x - event.clientX;
        setPreviewWidth(clamp(resizeStart.current.width + dx, 360, 500));
        return;
      }
      if (panning.current && panStart.current) {
        const dx = event.clientX - panStart.current.x;
        const dy = event.clientY - panStart.current.y;
        setPan((current) => ({ x: current.x + dx, y: current.y + dy }));
        panStart.current = { x: event.clientX, y: event.clientY };
        return;
      }
      if (draggingNode.current) {
        const pt = getSvgPoint(event.clientX, event.clientY);
        const dx = pt.x - dragStart.current.x;
        const dy = pt.y - dragStart.current.y;
        const clickStart = pendingNodeClick.current;
        if (clickStart) {
          const pixelDistance = Math.hypot(event.clientX - clickStart.x, event.clientY - clickStart.y);
          if (pixelDistance > 5) {
            nodeDragMoved.current = true;
            setSelectedNodeId(null);
            setSelectedEdgeId(null);
          }
        }
        if (!nodeDragMoved.current) return;
        const activeIds = selectedNodeIds.includes(draggingNode.current) ? selectedNodeIds : [draggingNode.current];
        setNodes((prev) => prev.map((node) => {
          if (!activeIds.includes(node.id)) return node;
          const start = nodeStartPos.current.get(node.id) || { x: node.x, y: node.y };
          return { ...node, x: snap(start.x + dx), y: snap(start.y + dy) };
        }));
        return;
      }
      if (connectingFrom.current) {
        const pt = getSvgPoint(event.clientX, event.clientY);
        setDraftEdge((prev) => prev ? { ...prev, x2: pt.x, y2: pt.y } : null);
      }
    });
  }, [getSvgPoint, selectedNodeIds]);

  const commitDragHistory = useCallback((event) => {
    if (draggingNode.current && pendingNodeClick.current && !nodeDragMoved.current && event?.type === 'mouseup') {
      setSelectedNodeId(pendingNodeClick.current.id);
      setSelectedEdgeId(null);
    }
    draggingNode.current = null;
    pendingNodeClick.current = null;
    nodeDragMoved.current = false;
    resizeStart.current = null;
    if (connectingFrom.current) {
      connectingFrom.current = null;
      setDraftEdge(null);
    }
    panning.current = false;
    panStart.current = null;
  }, []);

  const onCanvasMouseDown = (event) => {
    if (event.button === 1 || event.altKey || spaceDown) {
      panning.current = true;
      panStart.current = { x: event.clientX, y: event.clientY };
      event.preventDefault();
      return;
    }
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setSelectedNodeIds([]);
    setContextMenu(null);
  };

  const zoomAtPoint = (clientX, clientY, nextZoom) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouse = { x: clientX - rect.left, y: clientY - rect.top };
    const worldX = (mouse.x - pan.x) / zoom;
    const worldY = (mouse.y - pan.y) / zoom;
    setZoom(nextZoom);
    setPan({ x: mouse.x - worldX * nextZoom, y: mouse.y - worldY * nextZoom });
  };

  const zoomFromCenter = (factor) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    zoomAtPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, clamp(zoom * factor, 0.25, 2));
  };

  const onWheel = (event) => {
    event.preventDefault();
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (event.ctrlKey) {
      const speed = event.deltaMode === 1 ? 0.05 : 0.002;
      const factor = Math.exp(-event.deltaY * speed);
      zoomAtPoint(event.clientX, event.clientY, clamp(zoom * factor, 0.25, 2));
      return;
    }

    setPan((current) => ({
      x: current.x - event.deltaX - (event.shiftKey ? event.deltaY : 0),
      y: current.y - (event.shiftKey ? 0 : event.deltaY),
    }));
  };

  const onContextMenu = (event) => {
    event.preventDefault();
    const point = getSvgPoint(event.clientX, event.clientY);
    setContextMenu({ x: event.clientX, y: event.clientY, point });
  };

  const onEdgeLabelChange = (id, label) => setEdges((prev) => prev.map((edge) => edge.id === id ? { ...edge, label } : edge));

  useEffect(() => {
    const down = (event) => {
      const tag = event.target?.tagName?.toLowerCase();
      const isTypingField = tag === 'input' || tag === 'textarea' || tag === 'select' || event.target?.isContentEditable;
      if (isTypingField) return;
      if (event.code === 'Space') setSpaceDown(true);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      }
      if (event.key === 'Delete' || event.key === 'Backspace') deleteSelected();
      if ((event.ctrlKey || event.metaKey) && event.key === '0') {
        event.preventDefault();
        fitView();
      }
    };
    const up = (event) => {
      if (event.code === 'Space') setSpaceDown(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [deleteSelected, fitView, redo, undo]);

  const visibleNodes = useMemo(() => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return nodes;
    const margin = 260;
    const left = (-pan.x / zoom) - margin;
    const top = (-pan.y / zoom) - margin;
    const right = left + rect.width / zoom + margin * 2;
    const bottom = top + rect.height / zoom + margin * 2;
    return nodes.filter((node) => node.x + NODE_W >= left && node.x <= right && node.y + NODE_H >= top && node.y <= bottom);
  }, [nodes, pan, zoom]);

  const selectedNode = nodes.find((node) => node.id === selectedNodeId);
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId);

  return (
    <div className="chatbot-page">
      <div className="chatbot-hero">
        <div className="chatbot-hero-glow" />
        <div className="chatbot-hero-inner">
          <div>
            <div className="chatbot-eyebrow">Enterprise automation</div>
            <h1>Chatbot Flow Studio</h1>
            <p>Build WhatsApp automations with Figma-style movement, live testing, and production-ready rule logic.</p>
          </div>
          <div className="chatbot-hero-pills">
            <span>{nodes.length} nodes</span>
            <span>{edges.length} connections</span>
            <span>{rules.length} saved</span>
            <span>{Math.round(zoom * 100)}%</span>
          </div>
        </div>
      </div>

      {!readOnly && (
        <section className="chatbot-rule-library">
          <div>
            <div className="chatbot-library-title">Saved Automations</div>
            <p>Search, load, and update rules saved in database. Active rules are used by WhatsApp webhook replies.</p>
          </div>
          <label className="chatbot-rule-search">
            <MagnifyingGlassIcon />
            <input value={ruleSearch} onChange={(event) => setRuleSearch(event.target.value)} placeholder="Search rule, keyword, response..." />
          </label>
          <button type="button" className="chatbot-tool" onClick={fetchRules} disabled={rulesLoading}>{rulesLoading ? 'Syncing...' : 'Sync DB'}</button>
          <div className="chatbot-rule-list">
            {rulesLoading ? (
              <div className="chatbot-rule-empty">Loading saved automations...</div>
            ) : filteredRules.length ? (
              filteredRules.slice(0, 6).map((rule) => (
                <div key={rule._id} className={`chatbot-rule-item ${selectedRuleId === rule._id ? 'active' : ''}`}>
                  <button type="button" className="chatbot-rule-load" onClick={() => loadRule(rule)}>
                    <span>
                      <b>{rule.title || rule.keyword}</b>
                      <small>{rule.keyword} | {rule.ruleType} | {(rule.flow?.steps || []).length || 1} step(s)</small>
                    </span>
                    <i>{rule.isActive ? 'Active' : 'Off'}</i>
                  </button>
                  <button type="button" className="chatbot-rule-delete" onClick={() => deleteRule(rule)} title="Delete automation">
                    <TrashIcon />
                  </button>
                </div>
              ))
            ) : (
              <div className="chatbot-rule-empty">{ruleSearch ? 'No matching automation found.' : 'No saved automations yet. Save this flow to database.'}</div>
            )}
          </div>
        </section>
      )}

      <div className="chatbot-workspace" style={{ gridTemplateColumns: `minmax(0, 1fr) 8px ${previewWidth}px` }}>
        <section className="chatbot-builder">
          {!readOnly && (
            <Toolbar
              onAdd={addNode}
              onDelete={deleteSelected}
              onClear={clearAll}
              onLoadDemo={loadDemo}
              onExport={exportJSON}
              onImport={() => importInputRef.current?.click()}
              onFit={() => fitView()}
              onUndo={undo}
              onRedo={redo}
              onSave={saveRule}
              saving={savingRule}
              canUndo={history.length > 0}
              canRedo={future.length > 0}
              selectedCount={selectedCount}
            />
          )}
          <input ref={importInputRef} className="chatbot-file-input" type="file" accept="application/json,.json" onChange={importJSON} />
          <div
            ref={wrapRef}
            className={`chatbot-canvas ${spaceDown ? 'is-panning' : ''}`}
            onMouseMove={onPointerMove}
            onMouseUp={commitDragHistory}
            onMouseLeave={commitDragHistory}
            onMouseDown={onCanvasMouseDown}
            onWheel={onWheel}
            onContextMenu={onContextMenu}
          >
            <svg className="chatbot-grid">
              <defs>
                <pattern id="grid-dots" x={pan.x % (GRID * zoom)} y={pan.y % (GRID * zoom)} width={GRID * zoom} height={GRID * zoom} patternUnits="userSpaceOnUse">
                  <circle cx={(GRID * zoom) / 2} cy={(GRID * zoom) / 2} r={1} fill="#b8c8df" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid-dots)" />
            </svg>
            <svg ref={svgRef} className="chatbot-svg">
              <defs>
                <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M2 1L8 5L2 9" fill="none" stroke="#94a3b8" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
                </marker>
                <marker id="arr-selected" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M2 1L8 5L2 9" fill="none" stroke="#25D366" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                </marker>
              </defs>
              <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
                {edges.map((edge) => (
                  <Edge key={edge.id} edge={edge} nodes={nodes} selected={edge.id === selectedEdgeId} onClick={(id) => { setSelectedEdgeId(id); setSelectedNodeId(null); setSelectedNodeIds([]); }} />
                ))}
                {draftEdge && <path d={getBezier(draftEdge.x1, draftEdge.y1, draftEdge.x2, draftEdge.y2)} fill="none" stroke="#128C7E" strokeWidth={2} strokeDasharray="7 5" markerEnd="url(#arr-selected)" style={{ pointerEvents: 'none' }} />}
                {visibleNodes.map((node) => (
                  <NodeCard
                    key={node.id}
                    node={node}
                    selected={node.id === selectedNodeId}
                    multiSelected={selectedNodeIds.includes(node.id)}
                    onMouseDown={onNodeMouseDown}
                    onPortMouseDown={onPortMouseDown}
                    onPortMouseUp={onPortMouseUp}
                  />
                ))}
              </g>
            </svg>
            {!readOnly && (selectedNode || selectedEdge) && (
              <PropPanel
                node={selectedNode}
                edge={selectedEdge}
                nodes={nodes}
                onChange={updateNodeField}
                onDelete={deleteItem}
                onClose={() => { setSelectedNodeId(null); setSelectedEdgeId(null); setSelectedNodeIds([]); }}
                onEdgeLabelChange={onEdgeLabelChange}
              />
            )}
            <MiniMap nodes={nodes} edges={edges} viewBox={{ x: -pan.x / zoom, y: -pan.y / zoom, w: 760 / zoom, h: 520 / zoom }} canvasW={canvasW} canvasH={canvasH} onJump={() => fitView()} />
            <div className="chatbot-zoom">
              <button type="button" onClick={() => zoomFromCenter(1.16)}>+</button>
              <button type="button" onClick={() => zoomFromCenter(0.86)}>-</button>
              <button type="button" className="fit" onClick={() => fitView()}>fit</button>
            </div>
            {contextMenu && (
              <div className="chatbot-context" style={{ left: contextMenu.x, top: contextMenu.y }}>
                <button type="button" onClick={() => addNode('keyword', contextMenu.point)}>Add reply</button>
                <button type="button" onClick={() => addNode('flow', contextMenu.point)}>Add flow step</button>
                <button type="button" onClick={() => addNode('fallback', contextMenu.point)}>Add fallback</button>
              </div>
            )}
            {!nodes.length && (
              <div className="chatbot-empty">
                <div>AI</div>
                <b>Canvas is empty</b>
                <span>Use the toolbar or right-click to add nodes.</span>
              </div>
            )}
          </div>
          <div className="chatbot-footer">
            {Object.entries(NODE_META).map(([key, meta]) => <span key={key}><i style={{ background: meta.color }} />{meta.label}</span>)}
            <em>Trackpad/wheel to pan / Ctrl+wheel to zoom / Shift+click multi-select / Ctrl+Z undo</em>
          </div>
        </section>

        <div className="chatbot-resizer" onMouseDown={(event) => { resizeStart.current = { x: event.clientX, width: previewWidth }; }} />
        <MobilePreview nodes={nodes} edges={edges} selectedNodeId={selectedNodeId} />
      </div>

      <style>{`
        .chatbot-page { min-height: 100vh; padding: 28px; overflow-x: hidden; scroll-behavior: smooth; background: linear-gradient(180deg,#f7fffb 0%,#eefcf5 45%,#f8fafc 100%); font-family: Inter, "DM Sans", "Segoe UI", sans-serif; color: #0f172a; }
        .chatbot-hero { position: relative; overflow: hidden; border-radius: 28px; padding: 24px 28px; margin-bottom: 20px; color: #fff; background: linear-gradient(135deg,#075E54 0%,#128C7E 100%); box-shadow: 0 24px 60px rgba(7,94,84,.28); }
        .chatbot-hero-glow { position: absolute; right: -80px; bottom: -150px; width: 380px; height: 380px; border-radius: 50%; background: radial-gradient(circle,rgba(37,211,102,.42),rgba(37,211,102,.18),transparent 66%); }
        .chatbot-hero-inner { position: relative; z-index: 1; display: flex; justify-content: space-between; align-items: center; gap: 18px; flex-wrap: wrap; }
        .chatbot-eyebrow { color: #25D366; font-size: 11px; font-weight: 950; letter-spacing: .14em; text-transform: uppercase; margin-bottom: 7px; }
        .chatbot-hero h1 { margin: 0; font-size: 34px; line-height: 1; letter-spacing: -.03em; }
        .chatbot-hero p { margin: 8px 0 0; color: rgba(255,255,255,.82); font-size: 14px; }
        .chatbot-hero-pills { display: flex; gap: 10px; flex-wrap: wrap; }
        .chatbot-hero-pills span { border: 1px solid rgba(255,255,255,.18); background: rgba(255,255,255,.12); border-radius: 999px; padding: 10px 13px; font-size: 12px; font-weight: 900; backdrop-filter: blur(12px); }
        .chatbot-rule-library { margin-bottom:16px; border:1px solid rgba(226,232,240,.9); border-radius:22px; background:rgba(255,255,255,.9); box-shadow:0 18px 42px rgba(7,94,84,.08); backdrop-filter:blur(16px); padding:16px; display:grid; grid-template-columns:minmax(220px,1fr) minmax(260px,360px) auto; gap:12px; align-items:center; }
        .chatbot-library-title { color:#075E54; font-size:15px; font-weight:950; }
        .chatbot-rule-library p { margin:4px 0 0; color:#64748b; font-size:12px; line-height:1.45; }
        .chatbot-rule-search { position:relative; display:block; }
        .chatbot-rule-search svg { position:absolute; left:13px; top:50%; transform:translateY(-50%); width:17px; height:17px; color:#64748b; }
        .chatbot-rule-search input { width:100%; min-height:42px; border:1px solid #dbe4ef; border-radius:14px; background:#fff; padding:0 12px 0 40px; color:#0f172a; outline:none; font:inherit; font-size:13px; box-sizing:border-box; }
        .chatbot-rule-search input:focus { border-color:#25D366; box-shadow:0 0 0 3px rgba(37,211,102,.13); }
        .chatbot-rule-list { grid-column:1 / -1; display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
        .chatbot-rule-item { border:1px solid #dbe4ef; border-radius:16px; background:linear-gradient(180deg,#fff,#f8fafc); padding:10px; display:flex; align-items:stretch; justify-content:space-between; gap:8px; text-align:left; transition:all .18s ease; }
        .chatbot-rule-item:hover { transform:translateY(-1px); border-color:#25D366; box-shadow:0 14px 28px rgba(7,94,84,.09); }
        .chatbot-rule-item.active { border-color:#25D366; background:#ecfdf5; }
        .chatbot-rule-load { flex:1; min-width:0; border:0; background:transparent; padding:2px; display:flex; justify-content:space-between; gap:10px; text-align:left; cursor:pointer; }
        .chatbot-rule-item b { display:block; color:#0f172a; font-size:13px; }
        .chatbot-rule-item small { display:block; margin-top:4px; color:#64748b; font-size:11px; word-break:break-word; }
        .chatbot-rule-item i { flex:0 0 auto; height:max-content; border-radius:999px; background:#ecfdf5; color:#047857; padding:5px 8px; font-size:10px; font-style:normal; font-weight:950; }
        .chatbot-rule-delete { width:34px; min-width:34px; border:1px solid #fecaca; border-radius:12px; background:#fff1f2; color:#b91c1c; display:grid; place-items:center; cursor:pointer; transition:all .16s ease; }
        .chatbot-rule-delete:hover { background:#ffe4e6; transform:translateY(-1px); }
        .chatbot-rule-delete svg { width:16px; height:16px; }
        .chatbot-rule-empty { grid-column:1 / -1; border:1px dashed #cbd5e1; border-radius:16px; padding:14px; background:#f8fafc; color:#64748b; font-size:12px; font-weight:850; text-align:center; }
        .chatbot-workspace { display: grid; gap: 0; align-items: start; overflow: hidden; }
        .chatbot-builder, .chatbot-preview { height: calc(100vh - 190px); min-height: 780px; max-height: 860px; border: 1px solid rgba(226,232,240,.9); background: rgba(255,255,255,.88); box-shadow: 0 18px 42px rgba(7,94,84,.08); backdrop-filter: blur(16px); }
        .chatbot-builder { border-radius: 22px 0 0 22px; overflow: hidden; display: flex; flex-direction: column; }
        .chatbot-preview { border-radius: 0 22px 22px 0; padding: 18px; position: sticky; top: 20px; display: flex; flex-direction: column; align-items: center; overflow: hidden; box-sizing: border-box; }
        .chatbot-resizer { cursor: col-resize; background: linear-gradient(180deg,transparent,#dbe4ef,transparent); }
        .chatbot-toolbar { position: sticky; top: 0; z-index: 40; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 12px 14px; border-bottom: 1px solid #dbe4ef; background: rgba(255,255,255,.92); backdrop-filter: blur(12px); flex-shrink: 0; }
        .chatbot-toolbar-title { font-size: 13px; font-weight: 950; color: #075E54; margin-right: 4px; }
        .chatbot-file-input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
        .chatbot-sep { width: 1px; height: 22px; background: #dbe4ef; margin: 0 4px; }
        .chatbot-tool { border: 1px solid #dbe4ef; background: #fff; color: #128C7E; border-radius: 12px; padding: 8px 12px; font-size: 12px; font-weight: 900; cursor: pointer; transition: transform .16s ease, box-shadow .16s ease, opacity .16s ease; }
        .chatbot-tool:hover { transform: translateY(-1px); box-shadow: 0 10px 22px rgba(7,94,84,.1); }
        .chatbot-tool:disabled { opacity: .45; cursor: not-allowed; transform: none; box-shadow: none; }
        .chatbot-tool.accent { border-color: #25D366; background: linear-gradient(135deg,#25D366,#25D366); color: #063b2f; }
        .chatbot-tool.danger { border-color: #fecaca; background: #fff1f2; color: #b91c1c; }
        .chatbot-canvas { flex: 1 1 auto; min-height: 0; height: auto; position: relative; overflow: hidden; cursor: default; overscroll-behavior: contain; touch-action: none; background: radial-gradient(circle at top left,rgba(37,211,102,.14),transparent 30%),linear-gradient(135deg,#f7fffb,#eefcf5); }
        .chatbot-canvas.is-panning { cursor: grab; }
        .chatbot-grid, .chatbot-svg { position: absolute; inset: 0; width: 100%; height: 100%; }
        .chatbot-grid { pointer-events: none; z-index: 0; }
        .chatbot-svg { z-index: 1; }
        .chatbot-panel { position: absolute; top: 16px; right: 16px; z-index: 30; width: 310px; max-height: calc(100% - 32px); overflow-y: auto; overflow-x: hidden; padding: 16px; border: 1px solid rgba(219,228,239,.95); border-radius: 18px; background: rgba(255,255,255,.96); box-shadow: 0 24px 55px rgba(7,94,84,.16); backdrop-filter: blur(16px); overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: rgba(7,94,84,.24) transparent; }
        .chatbot-panel::-webkit-scrollbar { width: 6px; }
        .chatbot-panel::-webkit-scrollbar-thumb { background: rgba(7,94,84,.24); border-radius: 999px; }
        .chatbot-panel-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; color: #075E54; }
        .chatbot-panel-head button { width: 30px; height: 30px; border-radius: 12px; border: 1px solid #dbe4ef; background: #ecfdf5; color: #128C7E; cursor: pointer; font-weight: 900; }
        .chatbot-panel p { margin: 0 0 12px; color: #64748b; font-size: 12px; }
        .chatbot-panel label { display: block; margin-bottom: 10px; color: #334155; font-size: 11px; font-weight: 850; }
        .chatbot-panel input, .chatbot-panel textarea, .chatbot-panel select { display: block; width: 100%; margin-top: 5px; border: 1px solid #dbe4ef; border-radius: 12px; background: #fff; color: #0f172a; padding: 10px 11px; font: inherit; font-size: 12px; outline: none; box-sizing: border-box; transition: border-color .16s ease, box-shadow .16s ease; }
        .chatbot-panel input:focus, .chatbot-panel textarea:focus, .chatbot-panel select:focus { border-color: #25D366; box-shadow: 0 0 0 3px rgba(37,211,102,.14); }
        .chatbot-panel textarea { min-height: 104px; resize: vertical; line-height: 1.5; }
        .chatbot-checkline { display:flex !important; align-items:center; gap:10px; border:1px solid #dbe4ef; border-radius:13px; background:#f8fafc; padding:10px 11px; color:#0f172a !important; font-size:12px !important; font-weight:900 !important; }
        .chatbot-checkline input { width:16px !important; height:16px; margin:0 !important; padding:0 !important; accent-color:#25D366; }
        .chatbot-checkline span { flex:1; }
        .chatbot-type-row { display: grid; grid-template-columns: repeat(3,1fr); gap: 6px; margin-bottom: 12px; }
        .chatbot-type-row button { border: 1px solid #dbe4ef; background: #fff; border-radius: 11px; padding: 8px 4px; color: #64748b; font-size: 10px; font-weight: 900; cursor: pointer; }
        .chatbot-type-row button.active { border-color: #25D366; background: #ecfdf5; color: #047857; }
        .chatbot-delete { width: 100%; border: 1px solid #fecaca; border-radius: 13px; background: #fff1f2; color: #b91c1c; padding: 10px 0; font-weight: 900; cursor: pointer; }
        .chatbot-minimap { position: absolute; left: 16px; bottom: 16px; z-index: 20; border: 1px solid #dbe4ef; border-radius: 16px; background: rgba(255,255,255,.92); padding: 8px; box-shadow: 0 12px 28px rgba(7,94,84,.12); cursor: pointer; backdrop-filter: blur(12px); }
        .chatbot-zoom { position: absolute; right: 16px; bottom: 16px; z-index: 20; display: flex; flex-direction: column; gap: 6px; }
        .chatbot-zoom button { border: 1px solid #dbe4ef; background: #fff; color: #128C7E; border-radius: 12px; min-width: 34px; height: 34px; box-shadow: 0 12px 28px rgba(7,94,84,.12); font-weight: 950; cursor: pointer; }
        .chatbot-zoom .fit { font-size: 10px; min-width: 48px; }
        .chatbot-context { position: fixed; z-index: 80; width: 170px; padding: 8px; border: 1px solid #dbe4ef; border-radius: 15px; background: #fff; box-shadow: 0 22px 48px rgba(7,94,84,.16); }
        .chatbot-context button { display: block; width: 100%; border: 0; background: transparent; color: #0f172a; text-align: left; padding: 9px 10px; border-radius: 10px; font-weight: 850; cursor: pointer; }
        .chatbot-context button:hover { background: #ecfdf5; color: #128C7E; }
        .chatbot-empty { position: absolute; inset: 0; z-index: 5; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; }
        .chatbot-empty div { width: 58px; height: 58px; border-radius: 18px; background: #fff; display: grid; place-items: center; color: #128C7E; box-shadow: 0 18px 38px rgba(7,94,84,.12); margin-bottom: 12px; font-size: 24px; font-weight: 950; }
        .chatbot-empty b { font-size: 15px; color: #0f172a; }
        .chatbot-empty span { font-size: 12px; color: #64748b; margin-top: 4px; }
        .chatbot-footer { display: flex; gap: 16px; padding: 10px 16px; border-top: 1px solid #dbe4ef; background: rgba(255,255,255,.9); color: #64748b; flex-wrap: wrap; font-size: 11px; font-weight: 850; flex-shrink: 0; }
        .chatbot-footer span { display: flex; align-items: center; gap: 6px; }
        .chatbot-footer i { width: 8px; height: 8px; border-radius: 999px; display: inline-block; }
        .chatbot-footer em { margin-left: auto; color: #94a3b8; font-style: normal; }
        .chatbot-preview-head { width: 100%; display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-shrink: 0; }
        .chatbot-preview-head span { display: block; color: #128C7E; font-size: 11px; font-weight: 950; letter-spacing: .1em; text-transform: uppercase; }
        .chatbot-preview-head b { display: block; margin-top: 4px; font-size: 15px; }
        .chatbot-preview-head i, .chatbot-preview-head button { font-style: normal; border: 0; border-radius: 999px; background: #ecfdf5; color: #047857; padding: 6px 10px; font-size: 11px; font-weight: 950; cursor: pointer; }
        .chatbot-preview-head button:hover { background: #d1fae5; }
        .chatbot-phone { width: 290px; max-width: 100%; height: 628px; aspect-ratio: 390 / 844; margin: 0 auto; padding: 7px; border-radius: 40px; background: #070b13; box-shadow: 0 26px 54px rgba(7,94,84,.22); box-sizing: border-box; flex-shrink: 0; overflow: hidden; }
        .chatbot-phone-screen { width: 100%; height: 100%; min-height: 0; border-radius: 34px; overflow: hidden; background: #ece5dd; position: relative; display: flex; flex-direction: column; }
        .chatbot-notch { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); width: 80px; height: 15px; border-radius: 999px; background: #070b13; z-index: 3; }
        .chatbot-wa-top { height: 78px; flex: 0 0 78px; background: #075e54; padding: 28px 12px 9px; display: flex; align-items: center; gap: 8px; color: #fff; box-sizing: border-box; }
        .chatbot-wa-top > span { font-size: 24px; color: rgba(255,255,255,.86); }
        .chatbot-avatar { width: 30px; height: 30px; border-radius: 999px; background: #25D366; display: grid; place-items: center; color: #063b2f; font-weight: 950; font-size: 12px; }
        .chatbot-wa-top div:nth-child(3) { flex: 1; min-width: 0; }
        .chatbot-wa-top b { display: block; font-size: 13px; }
        .chatbot-wa-top small { display: block; color: rgba(255,255,255,.68); font-size: 10px; }
        .chatbot-wa-top em { font-style: normal; color: rgba(255,255,255,.75); font-size: 18px; }
        .chatbot-chat { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 10px; background: radial-gradient(circle at top left,rgba(255,255,255,.5),transparent 30%),#ece5dd; scrollbar-width: thin; scrollbar-color: rgba(7,94,84,.32) transparent; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; scroll-behavior: smooth; }
        .chatbot-chat::-webkit-scrollbar { width: 5px; }
        .chatbot-chat::-webkit-scrollbar-thumb { background: rgba(7,94,84,.28); border-radius: 999px; }
        .chatbot-scroll-end { height: 1px; }
        .chatbot-date { margin: 0 auto 9px; width: max-content; border-radius: 999px; background: rgba(255,255,255,.72); color: #64748b; padding: 3px 9px; font-size: 9px; }
        .chatbot-bubble { max-width: 86%; width: fit-content; margin-bottom: 8px; border-radius: 14px 14px 14px 4px; background: #fff; color: #1f2937; padding: 8px 10px 6px; font-size: 11px; line-height: 1.45; white-space: pre-wrap; box-shadow: 0 3px 8px rgba(0,0,0,.05); }
        .chatbot-bubble.user { margin-left: auto; border-radius: 14px 14px 4px 14px; background: #dcf8c6; }
        .chatbot-bubble small { display: block; margin-top: 3px; color: #94a3b8; text-align: right; font-size: 8px; }
        .chatbot-inline-actions { display: grid; gap: 6px; margin-top: 9px; padding-top: 8px; border-top: 1px solid rgba(18,140,126,.14); }
        .chatbot-inline-actions button { border: 1px solid rgba(18,140,126,.18); border-radius: 11px; background: #f8fffb; color: #128c7e; padding: 7px 9px; text-align: left; font-size: 10px; font-weight: 900; cursor: pointer; transition: transform .16s ease, background .16s ease; }
        .chatbot-inline-actions button:hover { background: #ecfdf5; transform: translateX(2px); }
        .chatbot-typing { width: 46px; display: flex; gap: 4px; padding: 9px 11px; border-radius: 14px; background: #fff; }
        .chatbot-typing span { width: 6px; height: 6px; border-radius: 999px; background: #94a3b8; animation: chatTyping 1s infinite ease-in-out; }
        .chatbot-typing span:nth-child(2) { animation-delay: .15s; }
        .chatbot-typing span:nth-child(3) { animation-delay: .3s; }
        .chatbot-quick { flex: 0 0 auto; display: flex; gap: 6px; max-height: 48px; padding: 8px 10px; overflow-x: auto; overflow-y: hidden; background: rgba(255,255,255,.7); }
        .chatbot-quick button { flex: 0 0 auto; border: 1px solid #dbe4ef; border-radius: 999px; background: #fff; color: #128c7e; padding: 6px 10px; font-size: 10px; font-weight: 900; }
        .chatbot-compose { flex: 0 0 48px; display: flex; align-items: center; gap: 7px; padding: 8px 9px; background: #f8fafc; box-sizing: border-box; position: relative; z-index: 2; }
        .chatbot-compose input { flex: 1; min-width: 0; border: 0; border-radius: 999px; background: #fff; padding: 9px 11px; outline: none; font-size: 11px; }
        .chatbot-compose button { min-width: 30px; height: 30px; border: 0; border-radius: 999px; background: #25D366; color: #fff; font-size: 10px; font-weight: 900; padding: 0 9px; }
        .chatbot-compose button:first-child { background: #ecfdf5; color: #128C7E; }
        .chatbot-nav { height: 27px; flex: 0 0 27px; background: #070b13; color: #94a3b8; display: flex; justify-content: space-around; align-items: center; font-size: 13px; }
        @keyframes chatTyping { 0%, 80%, 100% { transform: translateY(0); opacity: .45; } 40% { transform: translateY(-3px); opacity: 1; } }
        @media (max-width: 1080px) { .chatbot-rule-library { grid-template-columns:1fr; } .chatbot-rule-list { grid-template-columns:1fr; } .chatbot-workspace { grid-template-columns: 1fr !important; overflow: visible; } .chatbot-resizer { display: none; } .chatbot-builder, .chatbot-preview { height: auto; min-height: 640px; max-height: none; } .chatbot-preview { border-radius: 22px; position: static; margin-top: 16px; } .chatbot-builder { border-radius: 22px; } .chatbot-canvas { min-height: 560px; } .chatbot-phone { width: min(290px, 100%); height: auto; max-height: none; } }
      `}</style>
    </div>
  );
}
