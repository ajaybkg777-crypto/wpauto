const ChatbotRule = require('../models/ChatbotRule');

const sanitizeFlow = (flow) => {
  if (!flow) return flow;

  return {
    ...flow,
    steps: (flow.steps || []).map((step) => ({
      ...step,
      inputType: step.inputType || (['input', 'text'].includes(step.type) ? 'text' : step.type) || '',
      saveAnswerAs: step.saveAnswerAs || step.saveAs || step.save_as || '',
      nextStepId: step.nextStepId || step.next || '',
      options: (step.options || []).map((option) => {
        const nextOption = {
          ...option,
          addTags: (option.addTags || []).filter(Boolean)
        };
        if (option.sendAdmissionInfo) {
          nextOption.sendAdmissionInfo = true;
        }

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
  if (actions.sendAdmissionInfo) {
    nextActions.sendAdmissionInfo = true;
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
      'Welcome to BKG International School',
      '',
      'How can we help you today?',
      '1. Admission Inquiry',
      '2. Fee Structure',
      '3. School Facilities',
      '4. Transport Services',
      '5. Student Services',
      '6. Book Campus Visit',
      '7. Careers',
      '8. Talk To Counselor'
    ].join('\n'),
    quickReplies: [
      { label: 'Admission Inquiry', value: 'admission' },
      { label: 'Fee Structure', value: 'fees' },
      { label: 'Facilities', value: 'facilities' },
      { label: 'Transport', value: 'transport' },
      { label: 'Student Services', value: 'student services' },
      { label: 'Book Visit', value: 'visit' },
      { label: 'Careers', value: 'career' },
      { label: 'Counselor', value: 'counselor' }
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
              label: 'Apply Now',
              value: 'apply now',
              response: 'Great. Please complete the admission form. Our counselor will contact you shortly.',
              addTags: ['Admission Interested'],
              setStatus: 'interested',
              sendAdmissionInfo: true,
              endFlow: true
            },
            {
              label: 'Fee Structure',
              value: 'fees',
              response: 'Sure. We will share class-wise fee information and counselor support.',
              addTags: ['Fees Requested'],
              setStatus: 'pending',
              endFlow: true
            },
            {
              label: 'Book Campus Visit',
              value: 'visit',
              response: 'Please share your preferred visit date. Our admission office will confirm the slot.',
              addTags: ['Campus Visit Requested'],
              setStatus: 'follow_up',
              endFlow: true
            },
            {
              label: 'Talk To Counselor',
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
    title: 'Fee structure',
    response: [
      'Fee Structure',
      '',
      'Please choose the fee category:',
      '1. Admission Fee',
      '2. Tuition Fee',
      '3. Annual Fee',
      '4. Transport Fee',
      '5. Hostel Fee',
      '',
      'Payment methods: UPI, Credit Card, Debit Card, Net Banking, Cash'
    ].join('\n'),
    quickReplies: [
      { label: 'Admission Fee', value: 'admission fee' },
      { label: 'Tuition Fee', value: 'tuition fee' },
      { label: 'Transport Fee', value: 'transport fee' },
      { label: 'Admission', value: 'admission' },
      { label: 'Counselor', value: 'counselor' }
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
    title: 'Talk to counselor',
    response: [
      'Talk To Counselor',
      '',
      'Please choose the department:',
      '1. Admission Office',
      '2. Accounts',
      '3. Principal Office',
      '4. Transport Department',
      '5. Academic Department',
      '',
      'Our team will contact you shortly. Contact: {{4}}'
    ].join('\n'),
    quickReplies: [
      { label: 'Admission Office', value: 'admission office' },
      { label: 'Accounts', value: 'accounts' },
      { label: 'Transport', value: 'transport' },
      { label: 'Academic', value: 'academic department' },
      { label: 'Book Visit', value: 'visit' }
    ],
    actions: {
      addTags: ['Counselor Requested'],
      setStatus: 'follow_up'
    },
    matchType: 'contains',
    priority: 85
  },
  {
    keyword: 'facilities',
    ruleType: 'keyword',
    title: 'School facilities',
    response: [
      'School Facilities',
      '',
      'Smart Classes - Digital learning environment',
      'Computer Lab - Modern computer education',
      'Science Lab - Practical science learning',
      'Library - Knowledge resource center',
      'Sports - Indoor and outdoor activities',
      'CCTV Security - Safe campus environment'
    ].join('\n'),
    quickReplies: [
      { label: 'Admission', value: 'admission' },
      { label: 'Fees', value: 'fees' },
      { label: 'Book Visit', value: 'visit' },
      { label: 'Counselor', value: 'counselor' }
    ],
    actions: {
      addTags: ['Facility Enquiry'],
      setStatus: 'pending'
    },
    matchType: 'contains',
    priority: 80
  },
  {
    keyword: 'transport',
    ruleType: 'keyword',
    title: 'Transport services',
    response: [
      'Transport Services',
      '',
      'Please share your area name to check route availability.',
      'Our team will confirm bus route, pickup point, and transport fee.'
    ].join('\n'),
    quickReplies: [
      { label: 'Check Route', value: 'check route' },
      { label: 'Transport Fee', value: 'transport fee' },
      { label: 'Counselor', value: 'counselor' }
    ],
    actions: {
      addTags: ['Transport Enquiry'],
      setStatus: 'pending'
    },
    matchType: 'contains',
    priority: 79
  },
  {
    keyword: 'student services',
    ruleType: 'keyword',
    title: 'Student services',
    response: [
      'Student Services',
      '',
      '1. Attendance',
      '2. Homework',
      '3. Timetable',
      '4. Result',
      '5. Fee Status',
      '6. Certificate Request',
      '7. Leave Application',
      '8. Complaint'
    ].join('\n'),
    quickReplies: [
      { label: 'Attendance', value: 'attendance' },
      { label: 'Homework', value: 'homework' },
      { label: 'Timetable', value: 'timetable' },
      { label: 'Result', value: 'result' },
      { label: 'Fee Status', value: 'fee status' },
      { label: 'Complaint', value: 'complaint' }
    ],
    actions: {
      addTags: ['Student Services'],
      setStatus: 'pending'
    },
    matchType: 'contains',
    priority: 78
  },
  {
    keyword: 'visit',
    ruleType: 'keyword',
    title: 'Book campus visit',
    response: [
      'Book Campus Visit',
      '',
      'Please share:',
      'Parent Name',
      'Student Name',
      'Mobile Number',
      'Preferred Date',
      'Preferred Time',
      '',
      'Our admission office will confirm your visit slot.'
    ].join('\n'),
    quickReplies: [
      { label: 'Admission', value: 'admission' },
      { label: 'Facilities', value: 'facilities' },
      { label: 'Counselor', value: 'counselor' }
    ],
    actions: {
      addTags: ['Campus Visit Requested'],
      setStatus: 'follow_up'
    },
    matchType: 'contains',
    priority: 77
  },
  {
    keyword: 'career',
    ruleType: 'flow',
    title: 'Career enquiry flow',
    response: 'Job flow started',
    flow: {
      startStepId: 'job_interest',
      steps: [
        {
          id: 'job_interest',
          question: 'Which position are you interested in?',
          options: [
            { label: 'PRT', value: 'prt', response: 'Please share your name, qualification, experience, resume, and expected salary.', addTags: ['Career PRT'], setStatus: 'follow_up', endFlow: true },
            { label: 'TGT', value: 'tgt', response: 'Please share your name, qualification, experience, resume, and expected salary.', addTags: ['Career TGT'], setStatus: 'follow_up', endFlow: true },
            { label: 'PGT', value: 'pgt', response: 'Please share your name, qualification, experience, resume, and expected salary.', addTags: ['Career PGT'], setStatus: 'follow_up', endFlow: true },
            { label: 'Computer Teacher', value: 'computer teacher', response: 'Please share your name, qualification, experience, resume, and expected salary.', addTags: ['Career Computer Teacher'], setStatus: 'follow_up', endFlow: true },
            { label: 'Admin Staff', value: 'admin staff', response: 'Please share your name, qualification, experience, resume, and expected salary.', addTags: ['Career Admin Staff'], setStatus: 'follow_up', endFlow: true }
          ],
          fallbackResponse: 'Please choose a position from the list.'
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
      '1 Admission Inquiry',
      '2 Fee Structure',
      '3 School Facilities',
      '4 Transport Services',
      '5 Student Services',
      '6 Book Campus Visit',
      '7 Careers',
      '8 Talk To Counselor'
    ].join('\n'),
    priority: 0
  },
  {
    keyword: 'attendance',
    ruleType: 'keyword',
    title: 'Attendance lookup',
    response: 'Attendance\nPlease share the admission number. We will reply with present days, absent days, and attendance percentage.',
    actions: { addTags: ['Attendance Request'], setStatus: 'pending' },
    matchType: 'contains',
    priority: 70
  },
  {
    keyword: 'homework',
    ruleType: 'keyword',
    title: 'Homework lookup',
    response: 'Homework\nPlease share class and section to receive the latest homework.',
    actions: { addTags: ['Homework Request'], setStatus: 'pending' },
    matchType: 'contains',
    priority: 69
  },
  {
    keyword: 'timetable',
    ruleType: 'keyword',
    title: 'Timetable lookup',
    response: 'Timetable\nPlease share class. We will send the class timetable PDF if available.',
    actions: { addTags: ['Timetable Request'], setStatus: 'pending' },
    matchType: 'contains',
    priority: 68
  },
  {
    keyword: 'result',
    ruleType: 'keyword',
    title: 'Result lookup',
    response: 'Result\nPlease share admission number. We will reply with marks, percentage, grade, and rank if available.',
    actions: { addTags: ['Result Request'], setStatus: 'pending' },
    matchType: 'contains',
    priority: 67
  },
  {
    keyword: 'certificate',
    ruleType: 'keyword',
    title: 'Certificate request',
    response: 'Certificate Request\nChoose: Bonafide Certificate, Transfer Certificate, Character Certificate, Study Certificate, or Migration Certificate.',
    actions: { addTags: ['Certificate Request'], setStatus: 'pending' },
    matchType: 'contains',
    priority: 66
  },
  {
    keyword: 'leave',
    ruleType: 'keyword',
    title: 'Leave application',
    response: 'Leave Application\nPlease share student name, class, reason, start date, and end date.',
    actions: { addTags: ['Leave Application'], setStatus: 'pending' },
    matchType: 'contains',
    priority: 65
  },
  {
    keyword: 'complaint',
    ruleType: 'keyword',
    title: 'Complaint support',
    response: 'Complaint\nChoose category: Academic, Transport, Fee, Teacher, Technical, or Other. Please also write your issue.',
    actions: { addTags: ['Complaint'], setStatus: 'follow_up' },
    matchType: 'contains',
    priority: 64
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
    '3': 'facilities',
    '4': 'transport',
    '5': 'student services',
    '6': 'visit',
    '7': 'career',
    '8': 'counselor'
  };

  if (shortcuts[compact]) return shortcuts[compact];
  if (['hello', 'hey', 'hii', 'menu', 'start', 'namaste'].some((word) => isCloseMatch(compact, word))) return 'hi';
  if (['admission', 'admissions', 'addmission', 'admis', 'apply', 'dakhila', 'enquiry', 'inquiry', 'interested', 'intrested'].some((word) => isCloseMatch(compact, word))) return 'admission';
  if (['fee', 'fees', 'school fee', 'school fees', 'feez', 'price', 'pricing', 'cost', 'rate', 'package', 'charges', 'paisa', 'batao'].some((word) => isCloseMatch(compact, word))) return 'fees';
  if (['facility', 'facilities', 'smart class', 'computer lab', 'science lab', 'library', 'sports', 'cctv'].some((word) => isCloseMatch(compact, word))) return 'facilities';
  if (['student service', 'student services', 'attendance', 'homework', 'timetable', 'result', 'certificate', 'leave', 'complaint'].some((word) => isCloseMatch(compact, word))) return compact;
  if (['course', 'courses', 'class', 'classes', 'program', 'programs', 'batch', 'batches'].some((word) => isCloseMatch(compact, word))) return 'admission';
  if (['job', 'jobs', 'career', 'careers', 'vacancy', 'teacher', 'hr', 'prt', 'tgt', 'pgt'].some((word) => isCloseMatch(compact, word))) return 'career';
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
    const updated = [];

    for (const starterRule of PROFESSIONAL_STARTER_RULES) {
      const query = starterRule.isFallback
        ? { schoolId: req.schoolId, isFallback: true }
        : { schoolId: req.schoolId, keyword: starterRule.keyword };
      const existingRule = await ChatbotRule.findOne(query);

      if (existingRule) {
        Object.assign(existingRule, {
          responseType: 'text',
          ...starterRule,
          triggerCount: existingRule.triggerCount,
          lastTriggered: existingRule.lastTriggered
        });
        await existingRule.save();
        updated.push(existingRule);
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
      updated: updated.length,
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




