const bcrypt = require('bcryptjs');
const crypto = require('crypto');

let store = [];
let idCounter = 1;

// A plain string (not an object with only function properties) — real
// Mongoose ObjectIds define toJSON(), so they survive JSON.stringify(token
// payload) intact. An earlier version of this mock used a function-only
// object here, which JSON.stringify silently serialized to "{}", breaking
// every JWT that embedded a user id (caught by the auth middleware tests).
const nextId = () => `mockid-${idCounter++}`;

class ValidationError extends Error {
  constructor(errors) {
    super('User validation failed');
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

class DuplicateKeyError extends Error {
  constructor(keyPattern) {
    super('E11000 duplicate key error');
    this.code = 11000;
    this.keyPattern = keyPattern;
  }
}

class QueryMock {
  constructor(result) {
    this.result = result;
  }
  select() {
    return this;
  }
  then(resolve, reject) {
    return Promise.resolve(this.result).then(resolve, reject);
  }
  catch(reject) {
    return Promise.resolve(this.result).catch(reject);
  }
}

function validate(doc) {
  const errors = {};

  if (!doc.name) errors.name = { message: 'Name is required' };
  else if (doc.name.length < 2 || doc.name.length > 100) {
    errors.name = { message: 'Name must be between 2 and 100 characters' };
  }

  if (!doc.email) errors.email = { message: 'Email is required' };
  else if (!/^\S+@\S+\.\S+$/.test(doc.email)) {
    errors.email = { message: 'Please provide a valid email' };
  }

  if (doc.phone && !/^[0-9]{10}$/.test(doc.phone)) {
    errors.phone = { message: 'Please provide a valid 10-digit phone number' };
  }

  // Password minlength only checked against a freshly-set plaintext value
  // (mirrors Mongoose only re-validating on isModified('password')).
  if (doc._passwordModified && doc._pendingPlainPassword !== undefined) {
    if (doc._pendingPlainPassword.length < 6) {
      errors.password = { message: 'Password must be at least 6 characters' };
    }
  }

  if (Object.keys(errors).length) throw new ValidationError(errors);
}

function checkDuplicates(doc) {
  const emailClash = store.find((u) => u.email === doc.email && u !== doc);
  if (emailClash) throw new DuplicateKeyError({ email: 1 });

  if (doc.phone) {
    const phoneClash = store.find((u) => u.phone === doc.phone && u !== doc);
    if (phoneClash) throw new DuplicateKeyError({ phone: 1 });
  }

  if (doc.googleId) {
    const googleClash = store.find((u) => u.googleId === doc.googleId && u !== doc);
    if (googleClash) throw new DuplicateKeyError({ googleId: 1 });
  }
}

class FakeUser {
  constructor(fields = {}) {
    this._id = nextId();
    this.name = fields.name;
    this.phone = fields.phone;
    this.email = typeof fields.email === 'string' ? fields.email.toLowerCase().trim() : fields.email;
    this._password = undefined;
    this._passwordModified = false;
    this._pendingPlainPassword = undefined;
    this.role = fields.role || 'user';
    this.isVerified = fields.isVerified || false;
    this.googleId = fields.googleId;
    this.avatar = fields.avatar;
    this.authProvider = fields.authProvider || 'local';
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this._isNewDoc = true;

    if (fields.password !== undefined) this.password = fields.password;
  }

  // Mirrors Mongoose's isModified('password') tracking: any assignment to
  // `password` (constructor or later, e.g. during password reset) is
  // treated as a fresh plaintext value that must be re-hashed on save().
  get password() {
    return this._password;
  }

  set password(value) {
    this._password = value;
    this._passwordModified = true;
    this._pendingPlainPassword = value;
  }

  async save() {
    validate(this);

    if (this._isNewDoc) checkDuplicates(this);
    else {
      const others = store.filter((u) => u._id.toString() !== this._id.toString());
      const emailClash = others.find((u) => u.email === this.email);
      if (emailClash) throw new DuplicateKeyError({ email: 1 });
      const googleClash = this.googleId && others.find((u) => u.googleId === this.googleId);
      if (googleClash) throw new DuplicateKeyError({ googleId: 1 });
    }

    if (this._passwordModified && this._pendingPlainPassword) {
      const salt = await bcrypt.genSalt(10);
      this._password = await bcrypt.hash(this._pendingPlainPassword, salt);
      this._passwordModified = false;
      this._pendingPlainPassword = undefined;
    }

    if (this._isNewDoc) {
      store.push(this);
      this._isNewDoc = false;
    }

    return this;
  }

  async comparePassword(candidate) {
    if (!this.password) return false;
    return bcrypt.compare(candidate, this.password);
  }

  generateVerificationToken() {
    const token = crypto.randomBytes(32).toString('hex');
    this.verificationToken = crypto.createHash('sha256').update(token).digest('hex');
    this.verificationTokenExpiry = Date.now() + 24 * 60 * 60 * 1000;
    return token;
  }

  generateResetPasswordToken() {
    const token = crypto.randomBytes(32).toString('hex');
    this.resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');
    this.resetPasswordExpiry = Date.now() + 15 * 60 * 1000;
    return token;
  }

  toJSON() {
    return {
      _id: this._id,
      name: this.name,
      phone: this.phone,
      email: this.email,
      role: this.role,
      isVerified: this.isVerified,
      googleId: this.googleId,
      avatar: this.avatar,
      authProvider: this.authProvider,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

// Minimal Mongo-style condition matcher — just enough for the queries this
// codebase actually issues ($or, $gt on dates/numbers, plain equality).
const matches = (user, query = {}) => {
  return Object.entries(query).every(([key, condition]) => {
    if (key === '$or') {
      return condition.some((clause) => matches(user, clause));
    }
    const actual = user[key];
    if (condition && typeof condition === 'object' && '$gt' in condition) {
      return actual !== undefined && actual !== null && new Date(actual).getTime() > new Date(condition.$gt).getTime();
    }
    if (condition === undefined) return false;
    return actual === condition;
  });
};

FakeUser.findOne = (query = {}) => {
  const result = store.find((u) => matches(u, query)) || null;
  return new QueryMock(result);
};

FakeUser.findById = (id) => {
  const result = store.find((u) => u._id.toString() === id?.toString()) || null;
  return new QueryMock(result);
};

FakeUser.findOneAndUpdate = async (query, update, options = {}) => {
  const user = store.find((u) => matches(u, query));
  if (!user) return null;

  if (update.$set) Object.assign(user, update.$set);
  if (update.$unset) {
    Object.keys(update.$unset).forEach((key) => {
      user[key] = undefined;
    });
  }

  return options.new === false ? user : user;
};

// Test-only helpers (not present on the real Mongoose model).
FakeUser.__reset = () => {
  store = [];
  idCounter = 1;
};
FakeUser.__seed = async (fields) => {
  const u = new FakeUser(fields);
  await u.save();
  return u;
};
FakeUser.__all = () => store;

module.exports = FakeUser;
