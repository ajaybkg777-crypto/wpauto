const Lead = require('../models/Lead');
const School = require('../models/School');
const Excel = require('exceljs');

// @desc    Get all leads for a school
// @route   GET /api/leads
// @access  Private
exports.getLeads = async (req, res) => {
  try {
    const { status, source, search, tag, page = 1, limit = 20 } = req.query;
    
    const query = { schoolId: req.schoolId };
    
    if (status) query.status = status;
    if (source) query.source = source;
    if (tag) query.tags = tag;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;
    
    const [leads, total] = await Promise.all([
      Lead.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('assignedTo', 'name'),
      Lead.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      count: leads.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
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

    const lead = await Lead.create({
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
    await School.findByIdAndUpdate(req.schoolId, {
      $inc: { 'analytics.totalLeads': 1 }
    });

    res.status(201).json({
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
      {
        $push: {
          conversation: {
            from,
            message,
            timestamp: new Date()
          }
        },
        $set: {
          lastMessage: message,
          lastMessageAt: new Date()
        }
      },
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

    const createdLeads = [];
    const errors = [];

    for (const leadData of leads) {
      try {
        const lead = await Lead.findOrCreate(req.schoolId, leadData.phone, {
          name: leadData.name,
          email: leadData.email,
          tags: Array.isArray(leadData.tags)
            ? leadData.tags
            : String(leadData.tag || leadData.tags || '')
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean),
          source: 'imported',
          status: 'new'
        });
        createdLeads.push(lead);
      } catch (err) {
        errors.push({ phone: leadData.phone, error: err.message });
      }
    }

    // Update school analytics
    await School.findByIdAndUpdate(req.schoolId, {
      $inc: { 'analytics.totalLeads': createdLeads.length }
    });

    res.status(201).json({
      success: true,
      message: `${createdLeads.length} leads imported`,
      data: {
        imported: createdLeads.length,
        errors: errors.length,
        details: errors
      }
    });
  } catch (error) {
    res.status(500).json({
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
