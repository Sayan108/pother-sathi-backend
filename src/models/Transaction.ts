import mongoose, { Document, Schema } from 'mongoose';

export type TransactionType =
  | 'ride_earning'
  | 'ride_payment'
  | 'wallet_recharge'
  | 'platform_fee'
  | 'referral_bonus'
  | 'refund'
  | 'withdrawal';

export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'reversed';

export interface ITransaction extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  userModel: 'User' | 'Driver';
  type: TransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  rideId?: mongoose.Types.ObjectId;
  description: string;
  status: TransactionStatus;
  reference?: string;  // Payment gateway reference
  createdAt: Date;
  updatedAt: Date;
}

const transactionSchema = new Schema<ITransaction>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, refPath: 'userModel' },
    userModel: { type: String, required: true, enum: ['User', 'Driver'] },
    type: {
      type: String,
      required: true,
      enum: [
        'ride_earning',
        'ride_payment',
        'wallet_recharge',
        'platform_fee',
        'referral_bonus',
        'refund',
        'withdrawal',
      ],
    },
    amount: { type: Number, required: true },
    balanceBefore: { type: Number, required: true, default: 0 },
    balanceAfter: { type: Number, required: true, default: 0 },
    rideId: { type: Schema.Types.ObjectId, ref: 'Ride' },
    description: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'reversed'],
      default: 'completed',
    },
    reference: { type: String },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ rideId: 1 });

export const Transaction = mongoose.model<ITransaction>('Transaction', transactionSchema);
