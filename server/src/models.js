import mongoose from 'mongoose';
const { Schema, model } = mongoose; const ref = (m) => ({ type: Schema.Types.ObjectId, ref: m });
export const User = model('User', new Schema({ role: { type: String, enum: ['parent', 'accounts'], required: true }, name: String, phone: { type: String, unique: true, sparse: true },
  email: { type: String, unique: true, sparse: true }, hash: String, lang: { type: String, default: 'hi' }, students: [ref('Student')], consentAt: Date, otpHash: String, otpExp: Date }));
export const Student = model('Student', new Schema({ sid: { type: String, unique: true }, name: String, centre: String, batch: { type: String, index: true }, totalFee: Number, joinDate: Date,
  attendance: [Number], scores: [Number], risk: { score: Number, flagged: Boolean, reasons: [String] } }));
export const Instalment = model('Instalment', new Schema({ student: ref('Student'), no: Number, dueDate: Date, amount: Number, paid: { type: Number, default: 0 }, linkId: { type: String, index: true } }));
export const Payment = model('Payment', new Schema({ ref: { type: String, unique: true }, amount: Number, status: { type: String, enum: ['matched', 'unmatched'] }, linkId: String,
  student: ref('Student'), instalment: ref('Instalment'), gst: Number, receiptNo: String, note: String }, { timestamps: true }));
const rem = new Schema({ instalment: ref('Instalment'), student: ref('Student'), offset: Number, lang: String, text: String, channel: { type: String, default: 'whatsapp (mock)' } }, { timestamps: true });
rem.index({ instalment: 1, offset: 1 }, { unique: true }); // idempotent: never sends twice
export const Reminder = model('Reminder', rem);
export const Task = model('Task', new Schema({ student: ref('Student'), reason: String, score: Number, status: { type: String, enum: ['open', 'done', 'false_flag'], default: 'open' } }, { timestamps: true }));
export const RefundRec = model('RefundRec', new Schema({ student: ref('Student'), leaveDate: Date, paid: Number, consumed: Number, admin: Number, refund: Number, payBy: Date, by: String }, { timestamps: true }));

export const AuditLog = model('AuditLog', new Schema({ actorId: String, actorName: String, action: { type: String, required: true }, entityType: String, entityId: String, details: Schema.Types.Mixed, ip: String }, { timestamps: true }));
