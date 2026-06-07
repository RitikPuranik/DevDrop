import React, { useState } from 'react';
import { contactAPI } from '../../api/contact';
import { toast } from 'sonner';
import man from "../../assets/man.png";
import './ContactUs.css';

const LiquidMeltContactCard = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    message: '',
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Basic client-side validation
    if (!formData.name.trim() || !formData.email.trim() || !formData.phone.trim()) {
      toast.error('Please fill in all required fields.');
      return;
    }

    if (!/^[0-9]{10}$/.test(formData.phone.trim())) {
      toast.error('Please enter a valid 10-digit phone number.');
      return;
    }

    try {
      setLoading(true);
      const res = await contactAPI.submit(formData);
      toast.success(res.data?.message || 'Enquiry sent successfully!');
      setFormData({ name: '', email: '', phone: '', message: '' });
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.errors?.[0]?.message ||
        'Something went wrong. Please try again.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="contact-body">
      {/* 1. TEXTURE LAYER */}
      <div className="contact-noise" />

      {/* 2. THE LIQUID FILTER DEFINITIONS */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <filter id="metaballMelt" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="15" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 25 -10"
              result="melt"
            />
            <feComposite in="SourceGraphic" in2="melt" operator="atop" />
          </filter>
        </defs>

        <filter id="meltedShadow" x="-20%" y="-20%" width="150%" height="150%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="12" />
          <feOffset dx="0" dy="12" result="offsetblur" />
          <feComponentTransfer><feFuncA type="linear" slope="0.15" /></feComponentTransfer>
          <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </svg>

      {/* 3. THE CARD CONTAINER */}
      <div className="contact-card-container">
        <div className="contact-melt-layer">
          <div className="contact-main-rect" />
          <div className="contact-blob" style={{ top: '40px', left: '-30px', width: '70px', height: '60px' }} />
          <div className="contact-blob" style={{ top: '160px', left: '-45px', width: '90px', height: '50px' }} />
          <div className="contact-blob" style={{ top: '260px', left: '-35px', width: '80px', height: '70px' }} />
          <div className="contact-blob" style={{ top: '60px', right: '-40px', width: '100px', height: '60px' }} />
          <div className="contact-blob" style={{ top: '380px', right: '-35px', width: '90px', height: '80px' }} />
        </div>

        {/* 4. CONTENT LAYER */}
        <div className="contact-content-overlay">
          <div className="contact-inner-layout">

            {/* LEFT COLUMN: The Form */}
            <div className="contact-left-col">
              <h1 className="contact-h1">Get in <br />touch</h1>
              <p className="contact-p">Premium support for the modern curator. Drop us a line below.</p>

              <form onSubmit={handleSubmit} className="contact-form-group">
                <div className="contact-field-row">
                  <div className="contact-field contact-field-flex">
                    <label className="contact-label">FULL NAME *</label>
                    <input
                      className="contact-input"
                      type="text"
                      name="name"
                      placeholder="John Doe"
                      value={formData.name}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="contact-field contact-field-flex">
                    <label className="contact-label">EMAIL *</label>
                    <input
                      className="contact-input"
                      type="email"
                      name="email"
                      placeholder="hello@company.com"
                      value={formData.email}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>

                <div className="contact-field">
                  <label className="contact-label">PHONE NUMBER *</label>
                  <input
                    className="contact-input"
                    type="tel"
                    name="phone"
                    placeholder="9876543210"
                    value={formData.phone}
                    onChange={handleChange}
                    maxLength={10}
                    required
                  />
                </div>

                <div className="contact-field">
                  <label className="contact-label">MESSAGE <span style={{ opacity: 0.5, fontWeight: 400 }}>(optional)</span></label>
                  <textarea
                    className="contact-input contact-textarea"
                    name="message"
                    placeholder="How can we help?"
                    value={formData.message}
                    onChange={handleChange}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="contact-button"
                >
                  {loading ? 'SENDING...' : 'SEND ENQUIRY'}
                </button>
              </form>
            </div>

            {/* RIGHT COLUMN: Static Blended Image */}
            <div className="contact-right-col">
              <div className="contact-illustration-wrapper">
                <div className="contact-image-backdrop" />
                <img
                  src={man}
                  alt="Contact"
                  className="contact-main-image"
                />
              </div>

              <div className="contact-details">
                <div className="contact-email-row">
                  <span className="contact-info-label">DIRECT EMAIL</span>
                  <span className="contact-info-value contact-email-value">devdrop2026@gmail.com</span>
                </div>

                <div className="contact-social-row">
                  {['INSTAGRAM', 'LINKEDIN', 'TWITTER'].map(name => (
                    <span key={name} className="contact-social-link">{name}</span>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default LiquidMeltContactCard;
