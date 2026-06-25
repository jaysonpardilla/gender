/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import Sidebar from '../components/Sidebar';
import { HelpCircle, ChevronDown } from 'lucide-react';
import { analysisService } from '../services/authService';
import '../styles/HelpAndSupport.css';

interface FAQItem {
  id: number;
  question: string;
  answer: string;
  category: string;
}

const HelpAndSupport: React.FC = () => {
  const navigate = useNavigate();
  const [openFAQ, setOpenFAQ] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  });
  const [supportStatus, setSupportStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [submittingSupport, setSubmittingSupport] = useState(false);

  useEffect(() => {
    if (!supportStatus) return;
    const timer = setTimeout(() => setSupportStatus(null), 4000);
    return () => clearTimeout(timer);
  }, [supportStatus]);

  const userEmail = (() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        return user.email || 'User';
      } catch (e) {
        return 'User';
      }
    }
    return 'User';
  })();

  const getUserInitials = (): string => {
    const parts = userEmail.split('@')[0].split('.');
    return (parts[0]?.[0] + (parts[1]?.[0] || '')).toUpperCase().slice(0, 2);
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    navigate('/login');
  };

const faqItems: FAQItem[] = [
  {
    id: 1,
    question: 'How do I analyze text or a document?',
    answer:
      'You can analyze content by either typing or pasting text directly into the New Analysis page or uploading a supported document. Once submitted, the system scans the content for gender-biased words and automatically suggests gender-fair replacements.',
    category: 'Getting Started',
  },
  {
    id: 2,
    question: 'What file formats are supported?',
    answer:
      'The system currently supports PDF (.pdf), Microsoft Word (.docx), and plain text (.txt) files. Uploaded documents are processed and analyzed in the same way as manually entered text.',
    category: 'Technical',
  },
  {
    id: 3,
    question: 'What does the fairness score represent?',
    answer:
      'The fairness score indicates how inclusive your content is. A higher score means fewer gender-biased terms were found in the document. The score is calculated based on the number of biased words detected relative to the total content analyzed.',
    category: 'Features',
  },
  {
    id: 4,
    question: 'How does the system detect biased words?',
    answer:
      'The system uses a rule-based approach. It compares the words found in your text or document against the gender-biased terms stored in the "gender_fair_dataset_300.xls" dataset and replaces them with their corresponding gender-fair alternatives.',
    category: 'Technical',
  },
  {
    id: 5,
    question: 'Can I download the corrected text?',
    answer:
      'Yes. After analysis, you can download the corrected version of your content. The system preserves the original content while replacing detected gender-biased terms with gender-fair alternatives.',
    category: 'Features',
  },
  {
    id: 6,
    question: 'Where can I view my previous analyses?',
    answer:
      'All analyses performed while logged into your account are saved automatically. You can view them in the Analysis History page, where you can revisit and download previous results.',
    category: 'Account',
  },
  {
    id: 7,
    question: 'What is the Word Guide page?',
    answer:
      'The Word Guide contains a collection of gender-biased words and their recommended gender-fair replacements. It serves as an educational resource to help users write more inclusive and respectful content.',
    category: 'Features',
  },
  {
    id: 8,
    question: 'Will my analyses be saved automatically?',
    answer:
      'Yes. Every analysis performed while you are authenticated is stored in the database and linked to your account. This allows you to access your analysis history and reports at any time.',
    category: 'Account',
  },
  {
    id: 9,
    question: 'Does the system modify my original document?',
    answer:
      'No. The original content remains unchanged. The system generates a separate corrected version containing gender-fair replacements, allowing you to review the changes before downloading the result.',
    category: 'Technical',
  },
  {
    id: 10,
    question: 'Who can access my analysis results?',
    answer:
      'Only authenticated users can access their own analysis records. Your history, reports, and saved analyses are associated with your account and are not visible to other users.',
    category: 'Security',
  },
];

  const categories = ['all', 'Getting Started', 'Features', 'Technical', 'Account'];
  const filteredFAQ =
    selectedCategory === 'all' ? faqItems : faqItems.filter((item) => item.category === selectedCategory);

  const handleContactChange = (field: string, value: string) => {
    setContactForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmitContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingSupport(true);
    setSupportStatus(null);

    try {
      await analysisService.contactSupport(contactForm);
      setSupportStatus({ type: 'success', text: 'Thank you! Your message has been submitted.' });
      setContactForm({ name: '', email: '', subject: '', message: '' });
    } catch (error) {
      console.error('Contact support error:', error);
      setSupportStatus({
        type: 'error',
        text: 'We could not submit your message. Please try again.',
      });
    } finally {
      setSubmittingSupport(false);
    }
  };

  return (
    <div>
      <Navigation userEmail={userEmail} userInitials={getUserInitials()} onLogout={handleLogout} />
      <div className="dashboard-body">
        <Sidebar onLogout={handleLogout} />
        <div className="sidebar-placeholder" />
        <div className="dashboard-content">
          <div className="help-container">
            {/* Header */}
            <div className="help-header">
              <div>
                <h1>Help & Support</h1>
                <p className="header-subtitle">Find answers and get support</p>
              </div>
              <HelpCircle size={40} className="header-icon" />
            </div>

            {/* FAQ and Contact Sections Side by Side */}
            <div className="faq-and-contact-wrapper">
              {/* FAQ Section */}
              <div className="faq-section">
                <h2>Frequently Asked Questions</h2>

                {/* Category Filter */}
                <div className="faq-categories">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      className={`category-btn ${selectedCategory === cat ? 'active' : ''}`}
                      onClick={() => setSelectedCategory(cat)}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* FAQ Items */}
                <div className="faq-items">
                  {filteredFAQ.map((item) => (
                    <div key={item.id} className="faq-item">
                      <button
                        className="faq-header"
                        onClick={() => setOpenFAQ(openFAQ === item.id ? null : item.id)}
                      >
                        <span className="faq-question">{item.question}</span>
                        <ChevronDown
                          size={20}
                          className={`faq-icon ${openFAQ === item.id ? 'open' : ''}`}
                        />
                      </button>
                      {openFAQ === item.id && (
                        <div className="faq-answer">
                          <p>{item.answer}</p>
                          <span className="faq-category">{item.category}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Contact Form Section */}
              <div className="contact-section">
                <h2>Contact Us</h2>
                <p className="section-subtitle">Didn't find what you were looking for? Let us know!</p>
                {supportStatus && (
                  <div className={`support-status support-status-${supportStatus.type}`}>
                    {supportStatus.text}
                  </div>
                )}
                <form className="contact-form" onSubmit={handleSubmitContact}>
                  <div className="form-grid">
                    <div className="form-group">
                      <label>Name</label>
                      <input
                        type="text"
                        required
                        value={contactForm.name}
                        onChange={(e) => handleContactChange('name', e.target.value)}
                        placeholder="Your name"
                      />
                    </div>
                    <div className="form-group">
                      <label>Email</label>
                      <input
                        type="email"
                        required
                        value={contactForm.email}
                        onChange={(e) => handleContactChange('email', e.target.value)}
                        placeholder="your@email.com"
                      />
                    </div>
                  </div>

                  <div className="form-group full-width">
                    <label>Subject</label>
                    <input
                      type="text"
                      required
                      value={contactForm.subject}
                      onChange={(e) => handleContactChange('subject', e.target.value)}
                      placeholder="What is this about?"
                    />
                  </div>

                  <div className="form-group full-width">
                    <label>Message</label>
                    <textarea
                      required
                      rows={6}
                      value={contactForm.message}
                      onChange={(e) => handleContactChange('message', e.target.value)}
                      placeholder="Please describe your issue or question in detail..."
                    />
                  </div>

                  <button type="submit" className="btn-submit" disabled={submittingSupport}>
                    {submittingSupport ? 'Sending...' : 'Send Message'}
                  </button>
                </form>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default HelpAndSupport;
