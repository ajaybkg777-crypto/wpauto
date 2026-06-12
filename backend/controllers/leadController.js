const Lead = require('../models/Lead');
const School = require('../models/School');
const Excel = require('exceljs');
const { assertCanCreateContacts, getContactUsage } = require('../utils/usageLimits');
const { leadConversationUpdate } = require('../utils/storagePolicy');

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalizePhoneSearch = (value = '') => String(value).replace(/\D/g, '');
const normalizeContactPhone = (value = '') => {
  let digits = String(value || '').trim();
  if (!digits) return '';
  digits = digits.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  digits = digits.replace(/\D/g, '');
  if (digits.length === 10) {
    const countryCode = String(process.env.DEFAULT_COUNTRY_CODE || '91').replace(/\D/g, '');
    digits = `${countryCode}${digits}`;
  }
  return digits.length >= 8 && digits.length <= 15 ? digits : '';
};

const buildLeadQuery = (schoolId, filters = {}) => {
  const { status, source, search, tag } = filters;
  const query = { schoolId };

  if (status) query.status = status;
  if (source) query.source = source;
  if (tag) query.tags = tag;
  if (search) {
    const searchText = String(search).trim();
    const safeSearch = escapeRegex(searchText);
    const phoneDigits = normalizePhoneSearch(searchText);
    query.$or = [
      { name: { $regex: safeSearch, $options: 'i' } },
      { phone: { $regex: safeSearch, $options: 'i' } },
      { email: { $regex: safeSearch, $options: 'i' } },
      { tags: { $regex: safeSearch, $options: 'i' } },
      { notes: { $regex: safeSearch, $options: 'i' } },
      { lastMessage: { $regex: safeSearch, $options: 'i' } },
      ...(phoneDigits ? [{ phone: { $regex: phoneDigits, $options: 'i' } }] : [])
    ];
  }

  return query;
};

// @desc    Get all leads for a school
// @route   GET /api/leads
// @access  Private
exports.getLeads = async (req, res) => {
  try {
    const { status, source, search, tag, page = 1, limit = 20 } = req.query;
    const query = buildLeadQuery(req.schoolId, { status, source, search, tag });

    const skip = (page - 1) * limit;
    
    const [leads, total, usage] = await Promise.all([
      Lead.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('assignedTo', 'name'),
      Lead.countDocuments(query),
      getContactUsage(req.schoolId)
    ]);

    res.status(200).json({
      success: true,
      count: leads.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      usage,
      data: leads
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get single lead
// @route   GET /api/leads/:id
// @access  Private
exports.getLead = async (req, res) => {
  try {
    const lead = await Lead.findOne({ 
      _id: req.params.id, 
      schoolId: req.schoolId 
    }).populate('assignedTo', 'name email');

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    res.status(200).json({
      success: true,
      data: lead
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Create new lead
// @route   POST /api/leads
// @access  Private
exports.createLead = async (req, res) => {
  try {
    const { name, phone, email, source, status, notes, tags } = req.body;
    const existingLead = await Lead.findOne({ schoolId: req.schoolId, phone });
    if (!existingLead) {
      await assertCanCreateContacts(req.schoolId, 1);
    }

    const lead = existingLead || await Lead.create({
        schoolId: req.schoolId,
        name,
        phone,
        email,
        source: source || 'manual',
        status: status || 'new',
        notes,
        tags
      });

    // Update school analytics
    if (!existingLead) {
      await School.findByIdAndUpdate(req.schoolId, {
        $inc: { 'analytics.totalLeads': 1 }
      });
    }

    res.status(existingLead ? 200 : 201).json({
      success: true,
      message: existingLead ? 'Contact already exists' : 'Contact created',
      data: lead
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update lead
// @route   PUT /api/leads/:id
// @access  Private
exports.updateLead = async (req, res) => {
  try {
    const { name, phone, email, status, notes, tags, assignedTo, nextFollowUp } = req.body;

    let lead = await Lead.findOne({ 
      _id: req.params.id, 
      schoolId: req.schoolId 
    });

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    lead = await Lead.findByIdAndUpdate(
      req.params.id,
      { name, phone, email, status, notes, tags, assignedTo, nextFollowUp },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      data: lead
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Delete lead
// @route   DELETE /api/leads/:id
// @access  Private
exports.deleteLead = async (req, res) => {
  try {
    const lead = await Lead.findOne({ 
      _id: req.params.id, 
      schoolId: req.schoolId 
    });

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    await lead.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Lead deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Add conversation message to lead
// @route   POST /api/leads/:id/conversation
// @access  Private
exports.addConversation = async (req, res) => {
  try {
    const { message, from } = req.body;

    const lead = await Lead.findOneAndUpdate(
      { _id: req.params.id, schoolId: req.schoolId },
      leadConversationUpdate({
        from,
        message,
        timestamp: new Date()
      }),
      { new: true }
    );

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    res.status(200).json({
      success: true,
      data: lead
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Bulk import leads
// @route   POST /api/leads/import
// @access  Private
exports.importLeads = async (req, res) => {
  try {
    const { leads } = req.body;

    if (!leads || !Array.isArray(leads)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of leads'
      });
    }

    const preparedLeads = [];
    const skipped = [];
    const duplicateRows = [];
    const seenIncomingPhones = new Set();

    leads.forEach((lead, index) => {
      const phone = normalizeContactPhone(lead.phone);
      const name = String(lead.name || lead.fullName || lead.contactName || '').trim() || `Contact ${index + 1}`;

      if (!phone) {
        skipped.push({
          row: index + 1,
          phone: lead.phone || '',
          error: 'Invalid or missing phone number'
        });
        return;
      }

      if (seenIncomingPhones.has(phone)) {
        duplicateRows.push({
          row: index + 1,
          phone,
          error: 'Duplicate phone number in imported file'
        });
        return;
      }

      seenIncomingPhones.add(phone);
      preparedLeads.push({
        ...lead,
        name,
        phone,
        email: String(lead.email || '').trim().toLowerCase()
      });
    });

    const incomingPhones = [...new Set(preparedLeads.map((lead) => lead.phone).filter(Boolean))];
    const existingPhones = new Set(
      (await Lead.find({
        schoolId: req.schoolId,
        phone: { $in: [...incomingPhones, ...incomingPhones.map((phone) => phone.startsWith('91') && phone.length === 12 ? phone.slice(2) : phone)] }
      }).select('phone')).flatMap((lead) => [lead.phone, normalizeContactPhone(lead.phone)].filter(Boolean))
    );
    const newContactCount = incomingPhones.filter((phone) => !existingPhones.has(phone)).length;
    await assertCanCreateContacts(req.schoolId, newContactCount);

    let createdNewCount = 0;
    const errors = [];
    const now = new Date();
    const operations = preparedLeads.map((leadData) => {
      const tags = Array.isArray(leadData.tags)
        ? leadData.tags
        : String(leadData.tag || leadData.tags || '')
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean);

      if (!existingPhones.has(leadData.phone)) {
        createdNewCount += 1;
        existingPhones.add(leadData.phone);
      }

      return {
        updateOne: {
          filter: { schoolId: req.schoolId, phone: leadData.phone },
          update: {
            $set: {
              name: leadData.name,
              email: leadData.email,
              tags,
              source: 'imported',
              status: leadData.status || 'new',
              updatedAt: now
            },
            $setOnInsert: {
              schoolId: req.schoolId,
              phone: leadData.phone,
              createdAt: now
            }
          },
          upsert: true
        }
      };
    });

    if (operations.length) {
      try {
        const result = await Lead.bulkWrite(operations, { ordered: false });
        createdNewCount = result.upsertedCount || createdNewCount;
      } catch (error) {
        const writeErrors = error.writeErrors || error.result?.result?.writeErrors || [];
        writeErrors.slice(0, 100).forEach((writeError) => {
          const row = writeError.index;
          errors.push({
            row: typeof row === 'number' ? row + 1 : undefined,
            phone: preparedLeads[row]?.phone || '',
            error: writeError.errmsg || writeError.message || 'Contact import failed'
          });
        });
        createdNewCount = error.result?.upsertedCount || 0;
      }
    }

    // Update school analytics
    await School.findByIdAndUpdate(req.schoolId, {
      $inc: { 'analytics.totalLeads': createdNewCount }
    });

    res.status(201).json({
      success: true,
      message: `${preparedLeads.length - errors.length} leads imported`,
      data: {
        imported: preparedLeads.length - errors.length,
        newContacts: createdNewCount,
        skipped: skipped.length,
        duplicates: duplicateRows.length,
        errors: errors.length,
        details: [...skipped, ...duplicateRows, ...errors]
      }
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Export leads to Excel
// @route   GET /api/leads/export
// @access  Private
exports.exportLeads = async (req, res) => {
  try {
    const { status } = req.query;
    
    const query = { schoolId: req.schoolId };
    if (status) query.status = status;

    const leads = await Lead.find(query).sort({ createdAt: -1 });

    const workbook = new Excel.Workbook();
    const worksheet = workbook.addWorksheet('Leads');

    // Add headers
    worksheet.columns = [
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Phone', key: 'phone', width: 15 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Tags', key: 'tags', width: 25 },
      { header: 'Source', key: 'source', width: 15 },
      { header: 'Last Message', key: 'lastMessage', width: 40 },
      { header: 'Created At', key: 'createdAt', width: 20 }
    ];

    // Add rows
    leads.forEach(lead => {
      worksheet.addRow({
        name: lead.name,
        phone: lead.phone,
        email: lead.email || '',
        status: lead.status,
        tags: lead.tags?.join(', ') || '',
        source: lead.source,
        lastMessage: lead.lastMessage || '',
        createdAt: lead.createdAt.toISOString().split('T')[0]
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=leads.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get lead stats
// @route   GET /api/leads/stats
// @access  Private
exports.getLeadStats = async (req, res) => {
  try {
    const stats = await Lead.aggregate([
      { $match: { schoolId: req.schoolId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const formattedStats = {
      new: 0,
      interested: 0,
      not_interested: 0,
      pending: 0,
      converted: 0,
      follow_up: 0
    };

    stats.forEach(stat => {
      formattedStats[stat._id] = stat.count;
    });

    res.status(200).json({
      success: true,
      data: formattedStats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Bulk delete leads using current filters
// @route   DELETE /api/leads/bulk
// @access  Private
exports.bulkDeleteLeads = async (req, res) => {
  try {
    const { status, source, search, tag, ids, confirm } = req.body || {};
    const hasFilters = Boolean(status || source || search || tag);
    const hasIds = Array.isArray(ids) && ids.length > 0;

    if (!confirm) {
      return res.status(400).json({
        success: false,
        message: 'Please confirm bulk delete before deleting contacts'
      });
    }

    if (!hasFilters && !hasIds) {
      return res.status(400).json({
        success: false,
        message: 'Select a filter or provide selected contact IDs before bulk delete'
      });
    }

    const query = hasIds
      ? { schoolId: req.schoolId, _id: { $in: ids } }
      : buildLeadQuery(req.schoolId, { status, source, search, tag });

    const result = await Lead.deleteMany(query);

    if (result.deletedCount) {
      await School.findByIdAndUpdate(req.schoolId, {
        $inc: { 'analytics.totalLeads': -result.deletedCount }
      });
    }

    res.status(200).json({
      success: true,
      message: `${result.deletedCount || 0} contact(s) deleted`,
      data: {
        deleted: result.deletedCount || 0
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
