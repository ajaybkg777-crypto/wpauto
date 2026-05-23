const ChatbotRule = require('../models/ChatbotRule');

const sanitizeFlow = (flow) => {
  if (!flow) return flow;

  return {
    ...flow,
    steps: (flow.steps || []).map((step) => ({
      ...step,
      options: (step.options || []).map((option) => {
        const nextOption = {
          ...option,
          addTags: (option.addTags || []).filter(Boolean)
        };

        if (!nextOption.setStatus) {
          delete nextOption.setStatus;
        }

        if (!nextOption.nextStepId) {
          delete nextOption.nextStepId;
        }

        return nextOption;
      })
    }))
  };
};

const sanitizeActions = (actions = {}) => {
  const nextActions = {
    addTags: (actions.addTags || []).filter(Boolean)
  };

  if (actions.setStatus) {
    nextActions.setStatus = actions.setStatus;
  }

  return nextActions;
};

const sendChatbotError = (res, error, label = 'Chatbot error') => {
  console.error(`${label}:`, error);

  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: Object.values(error.errors).map((item) => item.message).join(', ')
    });
  }

  if (error.name === 'CastError') {
    return res.status(404).json({
      success: false,
      message: 'Rule not found'
    });
  }

  if (error.code === 11000) {
    const field = Object.keys(error.keyValue || {})[0] || 'Field';
    return res.status(400).json({
      success: false,
      message: `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`
    });
  }

  return res.status(500).json({
    success: false,
    message: error.message || 'Failed to process chatbot request'
  });
};

const PROFESSIONAL_STARTER_RULES = [
  {
    keyword: 'hi',
    ruleType: 'keyword',
    title: 'Main menu',
    response: [
      'Hello {{1}}',
      'Welcome. How can we help you today?',
      'Reply: 1 Admission | 2 Fees | 3 Counselor | 4 Courses | 5 Jobs'
    ].join('\n'),
    quickReplies: [
      { label: 'Admission', value: 'admission' },
      { label: 'Fees', value: 'fees' },
      { label: 'Counselor', value: 'counselor' },
      { label: 'Courses', value: 'courses' },
      { label: 'Jobs', value: 'job' }
    ],
    matchType: 'exact',
    priority: 100
  },
  {
    keyword: 'admission',
    ruleType: 'flow',
    title: 'Admission enquiry flow',
    response: 'Admission flow started',
    flow: {
      startStepId: 'interest',
      steps: [
        {
          id: 'interest',
          question: 'Are you interested in admission?',
          options: [
            {
              label: 'Yes',
              value: 'yes',
              response: 'Great. Admissions are open.\nApply here: {{2}}\nOur counselor will contact you shortly.',
              addTags: ['Admission Interested'],
              setStatus: 'interested',
              endFlow: true
            },
            {
              label: 'Fees',
              value: 'fees',
              response: 'Sure. You can check fees here: {{2}}\nReply counselor for a callback.',
              addTags: ['Fees Requested'],
              setStatus: 'pending',
              endFlow: true
            },
            {
              label: 'Counselor Call',
              value: 'call',
              response: 'Counselor request received.\nCall/WhatsApp: {{4}}',
              addTags: ['Counselor Requested'],
              setStatus: 'follow_up',
              endFlow: true
            }
          ],
          fallbackResponse: 'Please reply 1 for Yes, 2 for Fees, or 3 for Counselor.'
        }
      ]
    },
    matchType: 'contains',
    priority: 95
  },
  {
    keyword: 'fees',
    ruleType: 'keyword',
    title: 'Fees reply',
    response: 'Courses & Fees\nClass 9-10 | 11-12 | Competitive\nFor latest fee details, click: {{2}}',
    quickReplies: [
      { label: 'Admission', value: 'admission' },
      { label: 'Counselor', value: 'counselor' },
      { label: 'Courses', value: 'courses' }
    ],
    actions: {
      addTags: ['Fees Requested'],
      setStatus: 'pending'
    },
    matchType: 'contains',
    priority: 90
  },
  {
    keyword: 'counselor',
    ruleType: 'keyword',
    title: 'Counselor callback reply',
    response: 'Counselor request received.\nCall/WhatsApp: {{4}}\nApply Now: {{2}}',
    quickReplies: [
      { label: 'Admission', value: 'admission' },
      { label: 'Fees', value: 'fees' },
      { label: 'Courses', value: 'courses' }
    ],
    actions: {
      addTags: ['Counselor Requested'],
      setStatus: 'follow_up'
    },
    matchType: 'contains',
    priority: 85
  },
  {
    keyword: 'courses',
    ruleType: 'keyword',
    title: 'Courses reply',
    response: 'Available programs:\nClass 9-10 | 11-12 | Competitive Exams\nDetails: {{2}}',
    quickReplies: [
      { label: 'Admission', value: 'admission' },
      { label: 'Fees', value: 'fees' },
      { label: 'Counselor', value: 'counselor' }
    ],
    actions: {
      addTags: ['Course Enquiry'],
      setStatus: 'pending'
    },
    matchType: 'contains',
    priority: 80
  },
  {
    keyword: 'job',
    ruleType: 'flow',
    title: 'Teacher job flow',
    response: 'Job flow started',
    flow: {
      startStepId: 'job_interest',
      steps: [
        {
          id: 'job_interest',
          question: 'Are you interested in teaching job opportunities?',
          options: [
            {
              label: 'Yes',
              value: 'yes',
              response: 'Great. Please choose your subject.',
              nextStepId: 'job_subject',
              endFlow: false,
              addTags: ['Job Interested'],
              setStatus: 'interested'
            },
            {
              label: 'No',
              value: 'no',
              response: 'No problem. You can contact us anytime: {{4}}',
              endFlow: true,
              addTags: ['Job Not Interested'],
              setStatus: 'not_interested'
            }
          ],
          fallbackResponse: 'Please reply 1 for Yes or 2 for No.'
        },
        {
          id: 'job_subject',
          question: 'Which subject do you teach?',
          options: [
            {
              label: 'Maths',
              value: 'maths',
              response: 'Thanks. Please apply here: {{3}}\nContact: {{4}}',
              addTags: ['Subject Maths'],
              setStatus: 'follow_up',
              endFlow: true
            },
            {
              label: 'Science',
              value: 'science',
              response: 'Thanks. Please apply here: {{3}}\nContact: {{4}}',
              addTags: ['Subject Science'],
              setStatus: 'follow_up',
              endFlow: true
            }
          ],
          fallbackResponse: 'Please reply with a subject option.'
        }
      ]
    },
    matchType: 'contains',
    priority: 75
  },
  {
    keyword: '__fallback__',
    ruleType: 'keyword',
    title: 'Smart fallback menu',
    response: 'Menu fallback',
    isFallback: true,
    fallbackMessage: [
      'Sorry, please choose from options:',
      '1 Admission',
      '2 Fees',
      '3 Counselor',
      '4 Courses',
      '5 Jobs'
    ].join('\n'),
    priority: 0
  },
  {
    keyword: 'followup',
    ruleType: 'keyword',
    title: 'Admission follow-up',
    response: 'Hi {{1}}, just following up on your admission enquiry.\nApply here: {{2}}\nContact: {{4}}',
    matchType: 'exact',
    priority: 0
  }
];
const formatOptions = (options = []) => {
  if (!options.length) return '';
  return options.map((option, index) => `${index + 1}. ${option.label}`).join('\n');
};

const getFlowStartResponse = (rule) => {
  const startStep = rule.flow?.steps?.find((step) => step.id === rule.flow?.startStepId) || rule.flow?.steps?.[0];
  if (!startStep) return rule.response;

  const options = formatOptions(startStep.options);
  return options ? `${startStep.question}\n\n${options}` : startStep.question;
};

const getRuleResponse = (rule) => {
  if (!rule) return null;
  if (rule.isFallback) return rule.fallbackMessage || rule.response;
  return rule.ruleType === 'flow' ? getFlowStartResponse(rule) : rule.response;
};

const normalizeMessage = (message = '') => String(message).trim().toLowerCase();

const getEditDistance = (left = '', right = '') => {
  const a = String(left);
  const b = String(right);
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));

  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[a.length][b.length];
};

const isCloseMatch = (input = '', target = '') => {
  const value = normalizeMessage(input).replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const keyword = normalizeMessage(target);
  if (!value || !keyword) return false;
  if (value.includes(keyword) || keyword.includes(value)) return true;

  const words = value.split(' ').filter(Boolean);
  const maxDistance = keyword.length <= 4 ? 1 : 2;
  return words.some((word) => {
    if (Math.abs(word.length - keyword.length) > maxDistance) return false;
    return getEditDistance(word, keyword) <= maxDistance;
  });
};

const getIntentText = (message = '') => {
  const incoming = normalizeMessage(message);
  const compact = incoming.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const shortcuts = {
    '1': 'admission',
    '2': 'fees',
    '3': 'counselor',
    '4': 'courses',
    '5': 'job'
  };

  if (shortcuts[compact]) return shortcuts[compact];
  if (['hello', 'hey', 'hii', 'menu', 'start', 'namaste'].some((word) => isCloseMatch(compact, word))) return 'hi';
  if (['admission', 'admissions', 'addmission', 'admis', 'apply', 'dakhila', 'enquiry', 'inquiry', 'interested', 'intrested'].some((word) => isCloseMatch(compact, word))) return 'admission';
  if (['fee', 'fees', 'school fee', 'school fees', 'feez', 'price', 'pricing', 'cost', 'rate', 'package', 'charges', 'paisa', 'batao'].some((word) => isCloseMatch(compact, word))) return 'fees';
  if (['course', 'courses', 'class', 'classes', 'program', 'programs', 'batch', 'batches'].some((word) => isCloseMatch(compact, word))) return 'courses';
  if (['job', 'jobs', 'career', 'vacancy', 'teacher', 'hr'].some((word) => isCloseMatch(compact, word))) return 'job';
  if (['counsellor', 'counselor', 'counselling', 'counseling', 'call', 'callback', 'call back', 'contact', 'phone', 'help', 'baat', 'talk'].some((word) => isCloseMatch(compact, word))) return 'counselor';
  if (['visit', 'school visit', 'tour', 'campus', 'book visit', 'appointment', 'meeting', 'milna'].some((word) => isCloseMatch(compact, word))) return 'visit';
  if (['hostel', 'hostal', 'boarding'].some((word) => isCloseMatch(compact, word))) return 'hostel';
  if (['transport', 'bus', 'van', 'pickup'].some((word) => isCloseMatch(compact, word))) return 'transport';

  return incoming;
};

// @desc    Get all chatbot rules
// @route   GET /api/chatbot/rules
// @access  Private
exports.getRules = async (req, res) => {
  try {
    const rules = await ChatbotRule.find({ schoolId: req.schoolId })
      .sort({ priority: -1, createdAt: -1 });

    res.status(200).json({
      success: true,
      count: rules.length,
      data: rules
    });
  } catch (error) {
    sendChatbotError(res, error);
  }
};

// @desc    Get single rule
// @route   GET /api/chatbot/rules/:id
// @access  Private
exports.getRule = async (req, res) => {
  try {
    const rule = await ChatbotRule.findOne({ 
      _id: req.params.id, 
      schoolId: req.schoolId 
    });

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: 'Rule not found'
      });
    }

    res.status(200).json({
      success: true,
      data: rule
    });
  } catch (error) {
    sendChatbotError(res, error);
  }
};

// @desc    Create chatbot rule
// @route   POST /api/chatbot/rules
// @access  Private
exports.createRule = async (req, res) => {
  try {
    const {
      keyword,
      ruleType,
      title,
      response,
      responseType,
      mediaUrl,
      quickReplies,
      actions,
      flow,
      matchType,
      isFallback,
      fallbackMessage,
      priority
    } = req.body;
    const normalizedKeyword = isFallback ? '__fallback__' : keyword?.trim().toLowerCase();

    if (!isFallback && !normalizedKeyword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a keyword'
      });
    }

    // Check for duplicate keyword (non-fallback rules)
    if (!isFallback) {
      const existingRule = await ChatbotRule.findOne({ 
        schoolId: req.schoolId, 
        keyword: normalizedKeyword 
      });

      if (existingRule) {
        return res.status(400).json({
          success: false,
          message: 'Keyword already exists'
        });
      }
    } else {
      const existingFallback = await ChatbotRule.findOne({
        schoolId: req.schoolId,
        isFallback: true
      });

      if (existingFallback) {
        return res.status(400).json({
          success: false,
          message: 'Fallback rule already exists'
        });
      }
    }

    const rule = await ChatbotRule.create({
      schoolId: req.schoolId,
      keyword: normalizedKeyword,
      ruleType: ruleType || 'keyword',
      title,
      response,
      responseType: responseType || 'text',
      mediaUrl,
      quickReplies,
      actions: sanitizeActions(actions),
      flow: ruleType === 'flow' ? sanitizeFlow(flow) : undefined,
      matchType: matchType || 'contains',
      isFallback: isFallback || false,
      fallbackMessage,
      priority: priority || 0
    });

    res.status(201).json({
      success: true,
      data: rule
    });
  } catch (error) {
    sendChatbotError(res, error);
  }
};

// @desc    Update chatbot rule
// @route   PUT /api/chatbot/rules/:id
// @access  Private
exports.updateRule = async (req, res) => {
  try {
    const {
      keyword,
      ruleType,
      title,
      response,
      responseType,
      mediaUrl,
      quickReplies,
      actions,
      flow,
      matchType,
      isActive,
      isFallback,
      fallbackMessage,
      priority
    } = req.body;

    let rule = await ChatbotRule.findOne({ 
      _id: req.params.id, 
      schoolId: req.schoolId 
    });

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: 'Rule not found'
      });
    }

    const normalizedKeyword = isFallback ? '__fallback__' : keyword?.trim().toLowerCase();

    if (!isFallback && keyword !== undefined && !normalizedKeyword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a keyword'
      });
    }

    // Check for duplicate keyword if changing
    if (normalizedKeyword && normalizedKeyword !== rule.keyword) {
      const existingRule = await ChatbotRule.findOne({ 
        schoolId: req.schoolId, 
        keyword: normalizedKeyword,
        _id: { $ne: rule._id }
      });

      if (existingRule) {
        return res.status(400).json({
          success: false,
          message: 'Keyword already exists'
        });
      }
    }

    rule = await ChatbotRule.findByIdAndUpdate(
      req.params.id,
      {
        keyword: normalizedKeyword || undefined,
        ruleType,
        title,
        response,
        responseType,
        mediaUrl,
        quickReplies,
        actions: sanitizeActions(actions),
        flow: ruleType === 'flow' ? sanitizeFlow(flow) : undefined,
        matchType,
        isActive,
        isFallback,
        fallbackMessage,
        priority
      },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      data: rule
    });
  } catch (error) {
    sendChatbotError(res, error);
  }
};

// @desc    Delete chatbot rule
// @route   DELETE /api/chatbot/rules/:id
// @access  Private
exports.deleteRule = async (req, res) => {
  try {
    const rule = await ChatbotRule.findOne({ 
      _id: req.params.id, 
      schoolId: req.schoolId 
    });

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: 'Rule not found'
      });
    }

    await rule.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Rule deleted successfully'
    });
  } catch (error) {
    sendChatbotError(res, error);
  }
};

// @desc    Toggle rule active status
// @route   PATCH /api/chatbot/rules/:id/toggle
// @access  Private
exports.toggleRule = async (req, res) => {
  try {
    const rule = await ChatbotRule.findOne({ 
      _id: req.params.id, 
      schoolId: req.schoolId 
    });

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: 'Rule not found'
      });
    }

    rule.isActive = !rule.isActive;
    await rule.save();

    res.status(200).json({
      success: true,
      data: rule
    });
  } catch (error) {
    sendChatbotError(res, error);
  }
};

// @desc    Get chatbot analytics
// @route   GET /api/chatbot/analytics
// @access  Private
exports.getAnalytics = async (req, res) => {
  try {
    const rules = await ChatbotRule.find({ schoolId: req.schoolId });

    const analytics = {
      totalRules: rules.length,
      activeRules: rules.filter(r => r.isActive).length,
      totalTriggers: rules.reduce((sum, r) => sum + r.triggerCount, 0),
      topRules: rules
        .sort((a, b) => b.triggerCount - a.triggerCount)
        .slice(0, 5)
        .map(r => ({
          keyword: r.keyword,
          triggerCount: r.triggerCount,
          lastTriggered: r.lastTriggered
        }))
    };

    res.status(200).json({
      success: true,
      data: analytics
    });
  } catch (error) {
    sendChatbotError(res, error);
  }
};

// @desc    Create professional starter chatbot rules
// @route   POST /api/chatbot/starter-kit
// @access  Private
exports.createStarterKit = async (req, res) => {
  try {
    const created = [];
    const skipped = [];

    for (const starterRule of PROFESSIONAL_STARTER_RULES) {
      const query = starterRule.isFallback
        ? { schoolId: req.schoolId, isFallback: true }
        : { schoolId: req.schoolId, keyword: starterRule.keyword };
      const existingRule = await ChatbotRule.findOne(query);

      if (existingRule) {
        skipped.push(existingRule);
        continue;
      }

      const rule = await ChatbotRule.create({
        schoolId: req.schoolId,
        responseType: 'text',
        ...starterRule
      });
      created.push(rule);
    }

    res.status(201).json({
      success: true,
      created: created.length,
      skipped: skipped.length,
      data: created
    });
  } catch (error) {
    sendChatbotError(res, error);
  }
};

// @desc    Test chatbot response
// @route   POST /api/chatbot/test
// @access  Private
exports.testChatbot = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a test message'
      });
    }

    const rules = await ChatbotRule.find({ 
      schoolId: req.schoolId, 
      isActive: true 
    }).sort({ priority: -1 });

    let matchedRule = null;
    const intentText = getIntentText(message);

    for (const rule of rules) {
      let matched = false;
      
      if (rule.isFallback) {
        continue;
      }

      if (rule.matchType === 'exact') {
        matched = intentText === rule.keyword.toLowerCase() || isCloseMatch(intentText, rule.keyword);
      } else if (rule.matchType === 'contains') {
        matched = intentText.includes(rule.keyword.toLowerCase())
          || message.toLowerCase().includes(rule.keyword.toLowerCase())
          || isCloseMatch(intentText, rule.keyword)
          || isCloseMatch(message, rule.keyword);
      } else if (rule.matchType === 'starts_with') {
        matched = intentText.startsWith(rule.keyword.toLowerCase())
          || message.toLowerCase().startsWith(rule.keyword.toLowerCase())
          || isCloseMatch(intentText, rule.keyword);
      }

      if (matched) {
        matchedRule = rule;
        break;
      }
    }

    if (!matchedRule) {
      // Check for fallback
      const fallbackRule = await ChatbotRule.findOne({ 
        schoolId: req.schoolId, 
        isActive: true,
        isFallback: true 
      });
      
      if (fallbackRule) {
        matchedRule = fallbackRule;
      }
    }

    res.status(200).json({
      success: true,
      data: matchedRule ? {
        matched: true,
        keyword: matchedRule.keyword,
        ruleType: matchedRule.ruleType,
        response: getRuleResponse(matchedRule),
        responseType: matchedRule.responseType,
        mediaUrl: matchedRule.mediaUrl,
        quickReplies: matchedRule.ruleType === 'flow'
          ? (matchedRule.flow?.steps?.find((step) => step.id === matchedRule.flow?.startStepId) || matchedRule.flow?.steps?.[0])?.options?.map((option) => option.label) || []
          : matchedRule.quickReplies?.map((reply) => reply.label) || []
      } : {
        matched: false,
        response: null
      }
    });
  } catch (error) {
    sendChatbotError(res, error);
  }
};




