import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { chatAPI, leadAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { ArrowLeftIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline';

export default function LeadDetail() {
  const { id } = useParams();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchLead();
  }, [id]);

  const fetchLead = async () => {
    try {
      const response = await chatAPI.getConversation(id);
      setLead(response.data.data.lead);
    } catch (error) {
      toast.error('Failed to fetch lead');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;

    setSending(true);
    try {
      await chatAPI.sendMessage(lead._id, { message });
      toast.success('Message sent successfully');
      setMessage('');
      fetchLead();
    } catch (error) {
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    try {
      await leadAPI.updateLead(lead._id, { status: newStatus });
      toast.success('Status updated');
      fetchLead();
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Lead not found</p>
        <Link to="/leads" className="text-primary hover:underline mt-2 inline-block">
          Back to Leads
        </Link>
      </div>
    );
  }

  const getStatusBadge = (status) => {
    const styles = {
      new: 'badge-info',
      interested: 'badge-success',
      not_interested: 'badge-error',
      pending: 'badge-warning',
      converted: 'badge-success',
      follow_up: 'badge-warning'
    };
    return styles[status] || 'badge-info';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/leads" className="p-2 hover:bg-emerald-50 rounded-xl">
          <ArrowLeftIcon className="w-5 h-5 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{lead.name}</h1>
          <p className="text-gray-600">{lead.phone}</p>
        </div>
        <span className={`badge ${getStatusBadge(lead.status)} ml-auto`}>
          {lead.status?.replace('_', ' ')}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lead Info */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Lead Information</h3>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600">Phone</p>
              <p className="font-medium">{lead.phone}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Email</p>
              <p className="font-medium">{lead.email || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Source</p>
              <p className="font-medium capitalize">{lead.source?.replace('_', ' ')}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Created</p>
              <p className="font-medium">{new Date(lead.createdAt).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-2">Status</p>
              <select
                value={lead.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="input-field"
              >
                <option value="new">New</option>
                <option value="interested">Interested</option>
                <option value="pending">Pending</option>
                <option value="not_interested">Not Interested</option>
                <option value="converted">Converted</option>
                <option value="follow_up">Follow Up</option>
              </select>
            </div>
            {lead.notes && (
              <div>
                <p className="text-sm text-gray-600">Notes</p>
                <p className="font-medium">{lead.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Conversation */}
        <div className="lg:col-span-2 card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Conversation</h3>
          
          {/* Messages */}
          <div className="space-y-4 max-h-96 overflow-y-auto mb-4">
            {lead.conversation?.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No messages yet</p>
            ) : (
              lead.conversation?.map((msg, index) => (
                <div
                  key={index}
                  className={`flex ${msg.from === 'school' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-2 rounded-xl ${
                      msg.from === 'school'
                        ? 'bg-primary text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    <p className="text-sm">{msg.message}</p>
                    <p className={`text-xs mt-1 ${msg.from === 'school' ? 'text-white/70' : 'text-gray-500'}`}>
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Send Message */}
          <form onSubmit={handleSendMessage} className="flex gap-3">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type a message..."
              className="input-field flex-1"
            />
            <button
              type="submit"
              disabled={sending || !message.trim()}
              className="btn-primary px-4"
            >
              {sending ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <PaperAirplaneIcon className="w-5 h-5" />
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
