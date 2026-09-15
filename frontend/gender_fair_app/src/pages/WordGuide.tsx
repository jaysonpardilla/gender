/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navigation from '../components/Navigation';
import Sidebar from '../components/Sidebar';
import { Search, AlertCircle } from 'lucide-react';
import '../styles/WordGuide.css';

interface BiasedWord {
  word: string;
  category: string;
  context: string;
  alternatives: string[];
  explanation: string;
}

const WordGuide: React.FC = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

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

  const biasedWords: BiasedWord[] = [
    {
      word: 'Businessman/Businesswoman',
      category: 'Gender',
      context: 'Career & Professional',
      alternatives: ['Business professional', 'Entrepreneur', 'Executive'],
      explanation: 'Using gender-neutral terms ensures inclusivity and avoids reinforcing gender stereotypes in professional contexts.',
    },
    {
      word: 'He/She (as default)',
      category: 'Gender',
      context: 'General Pronouns',
      alternatives: ['They', 'Person', 'Individual'],
      explanation: 'Using singular "they" or avoiding pronouns altogether includes non-binary individuals and promotes gender neutrality.',
    },
    {
      word: 'Mothering/Fathering',
      category: 'Family',
      context: 'Parenting & Family',
      alternatives: ['Parenting', 'Caregiving', 'Nurturing'],
      explanation: 'Gender-neutral alternatives include all types of caregivers and family structures.',
    },
    {
      word: 'Steward/Stewardess',
      category: 'Occupation',
      context: 'Travel & Service',
      alternatives: ['Flight attendant', 'Air attendant'],
      explanation: 'Modern professional titles are inclusive regardless of gender.',
    },
    {
      word: 'Fireman',
      category: 'Occupation',
      context: 'Emergency Services',
      alternatives: ['Firefighter', 'Fire service personnel'],
      explanation: 'Gender-neutral job titles better represent the diversity of workers in these roles.',
    },
    {
      word: 'Mailman',
      category: 'Occupation',
      context: 'Postal Service',
      alternatives: ['Mail carrier', 'Postal worker'],
      explanation: 'Many postal service workers are not men; using inclusive terms reflects this reality.',
    },
    {
      word: 'Handicapped',
      category: 'Ability',
      context: 'Disability',
      alternatives: ['Person with a disability', 'Disabled person'],
      explanation: 'Person-first language focuses on the individual rather than the disability.',
    },
    {
      word: 'Crazy/Insane',
      category: 'Ability',
      context: 'Mental Health',
      alternatives: ['Distressing', 'Unusual', 'Challenging'],
      explanation: 'Avoid using mental health terminology as insult language because it stigmatizes people with mental health conditions.',
    },
    {
      word: 'Old man/Old lady',
      category: 'Age',
      context: 'Age & Respect',
      alternatives: ['Older adult', 'Senior', 'Elder'],
      explanation: 'Respectful age language avoids reducing a person to a stereotype or an age category.',
    },
    {
      word: 'Violent thug',
      category: 'Race',
      context: 'Criminal Descriptions',
      alternatives: ['Suspect', 'Person involved'],
      explanation: 'Neutral descriptions avoid racial bias and focus on behavior rather than identity.',
    },
    {
      word: 'Christian values',
      category: 'Religion',
      context: 'Belief Systems',
      alternatives: ['Cultural values', 'Community values'],
      explanation: 'Language that includes multiple faiths helps avoid centering one religion over others.',
    },
    {
      word: 'Rich kid',
      category: 'Socioeconomic',
      context: 'Economic Status',
      alternatives: ['Privileged youth', 'Affluent young person'],
      explanation: 'Using neutral terms avoids reinforcing class stereotypes and divides between groups.',
    },
    {
      word: 'Illegal immigrant',
      category: 'Nationality',
      context: 'Migration & Residency',
      alternatives: ['Undocumented person', 'Migrant'],
      explanation: 'People should not be defined by immigration status; terms that describe actions are less stigmatizing.',
    },
    {
      word: 'Man up',
      category: 'Gender',
      context: 'Emotional Expectations',
      alternatives: ['Be strong', 'Stay resilient'],
      explanation: 'Phrases that tie courage to gender reinforce harmful norms about who can show emotion.',
    },
    {
      word: 'Gypped',
      category: 'Race',
      context: 'Fairness & Deals',
      alternatives: ['Cheated', 'Shortchanged'],
      explanation: 'Avoiding slurs rooted in Romani stereotypes prevents perpetuating prejudice in everyday language.',
    },
    {
      word: 'Baby doll',
      category: 'Sexual Orientation',
      context: 'Romantic Language',
      alternatives: ['Dear', 'Love'],
      explanation: 'Using respectful terms helps keep language warm without objectifying someone.',
    },
    {
      word: 'Plump',
      category: 'Body Type',
      context: 'Physical Descriptions',
      alternatives: ['Curvy', 'Full-figured'],
      explanation: 'Choose body-positive language that avoids making weight the primary descriptor.',
    },
  ];

  const categories = ['all', 'Gender', 'Family', 'Occupation', 'Ability', 'Age', 'Race', 'Religion', 'Socioeconomic', 'Nationality', 'Sexual Orientation', 'Body Type'];

  const filteredWords = biasedWords.filter((item) => {
    const matchesSearch =
      item.word.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.explanation.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.context.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });


  return (
    <div>
      <Navigation userEmail={userEmail} userInitials={getUserInitials()} onLogout={handleLogout} />
      <div className="dashboard-body">
        <Sidebar onLogout={handleLogout} />
        <div className="sidebar-placeholder" />
        <div className="dashboard-content">
          <div className="guide-container">
            {/* Header */}
            <div className="guide-header">
              <div>
                <h1>Word Guide</h1>
                <p className="header-subtitle">Learn about biased words and their fair alternatives</p>
              </div>
              <div className="search-box">
                <Search size={18} />
                <input
                  type="text"
                  placeholder="Search for words or concepts..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            {/* Category Slider */}
            <div className="search-section">
              <div className="category-slider">
                <div className="category-track">
                  {categories.map((cat, idx) => (
                    <button
                      key={`${cat}-${idx}`}
                      className={`filter-btn ${selectedCategory === cat ? 'active' : ''}`}
                      onClick={() => setSelectedCategory(cat)}
                    >
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Info Banner */}
            <div className="info-banner">
              <AlertCircle size={20} />
              <p>
                This guide provides examples of biased language and suggestions for more inclusive alternatives. 
                Understanding and using fair language helps create more welcoming and equitable communication.
              </p>
            </div>

            {/* Words Grid */}
            <div className="words-container">
              {filteredWords.length > 0 ? (
                <div className="words-grid">
                  {filteredWords.map((item, index) => (
                    <div key={index} className="word-card">
                      <div className="word-header">
                        <h3 className="biased-word">{item.word}</h3>
                        <span className="category-badge">{item.category}</span>
                      </div>

                      <div className="word-context">
                        <span className="context-label">Context:</span>
                        <span className="context-value">{item.context}</span>
                      </div>

                      <div className="word-explanation">
                        <p>{item.explanation}</p>
                      </div>

                      <div className="alternatives-section">
                        <h4>Suggested Alternatives:</h4>
                        <div className="alternatives-list">
                          {item.alternatives.map((alt, i) => (
                            <span key={i} className="alternative-badge">
                              {alt}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <p>No words found matching your search. Try different keywords or categories.</p>
                </div>
              )}
            </div>

            {/* Tips Section */}
            <div className="tips-section">
              <h2>Tips for Fair Language</h2>
              <div className="tips-grid">
                <div className="tip-card">
                  <h3>1. Use Gender-Neutral Terms</h3>
                  <p>Replace gendered job titles with neutral alternatives (e.g., "police officer" instead of "policeman").</p>
                </div>
                <div className="tip-card">
                  <h3>2. Vary Pronouns</h3>
                  <p>Use "they/them" or alternate between pronouns to avoid defaulting to a specific gender.</p>
                </div>
                <div className="tip-card">
                  <h3>3. Avoid Stereotypes</h3>
                  <p>Don't assume roles or characteristics based on gender in descriptions or examples.</p>
                </div>
                <div className="tip-card">
                  <h3>4. Be Inclusive</h3>
                  <p>Consider all types of families, backgrounds, and identities in your language choices.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WordGuide;
