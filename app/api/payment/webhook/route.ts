import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// This is now a fake payment completion endpoint (no Stripe/external gateway)
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { session_id, card_number, expiry, cvv, cardholder_name } = body;

        // Validate fake payment fields
        if (!session_id || !card_number || !expiry || !cvv || !cardholder_name) {
            return NextResponse.json({
                error: 'Missing payment details'
            }, { status: 400 });
        }

        // Simulate basic card validation for demo
        if (card_number.replace(/\s/g, '').length < 13) {
            return NextResponse.json({
                error: 'Invalid card number'
            }, { status: 400 });
        }

        if (cvv.length < 3) {
            return NextResponse.json({
                error: 'Invalid CVV'
            }, { status: 400 });
        }

        // Find the payment record
        const payment = await prisma.payment.findFirst({
            where: {
                stripe_session_id: session_id, // Using this field for our fake session ID
            },
        });

        if (!payment) {
            return NextResponse.json({
                error: 'Payment session not found'
            }, { status: 404 });
        }

        if (payment.status !== 'PENDING') {
            return NextResponse.json({
                error: 'Payment already processed'
            }, { status: 400 });
        }

        // Simulate random payment failure (5% chance for demo)
        const simulateFailure = Math.random() < 0.05;

        if (simulateFailure) {
            await prisma.payment.update({
                where: { id: payment.id },
                data: {
                    status: 'FAILED',
                    processed_at: new Date(),
                },
            });

            return NextResponse.json({
                success: false,
                error: 'Payment declined - insufficient funds (simulated)'
            }, { status: 402 });
        }

        // Generate fake transaction ID
        const fakeTransactionId = `fake_txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Update payment status to completed
        await prisma.payment.update({
            where: { id: payment.id },
            data: {
                status: 'COMPLETED',
                stripe_payment_id: fakeTransactionId, // Store fake transaction ID
                processed_at: new Date(),
                payment_method: `FAKE CARD ****${card_number.slice(-4)}`,
            },
        });

        // Create access grant (24 hours)
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

        await prisma.accessGrant.create({
            data: {
                request_id: payment.request_id,
                user_id: payment.client_id,
                expires_at: expiresAt,
                is_active: true,
            },
        });

        // Update advocate earnings
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();

        await prisma.monthlyEarnings.upsert({
            where: {
                advocate_id_year_month: {
                    advocate_id: payment.advocate_id,
                    year,
                    month,
                },
            },
            update: {
                total_amount: {
                    increment: payment.amount,
                },
                consultation_count: {
                    increment: 1,
                },
            },
            create: {
                advocate_id: payment.advocate_id,
                year,
                month,
                total_amount: payment.amount,
                consultation_count: 1,
            },
        });

        // Update advocate total earnings
        await prisma.advocateProfile.update({
            where: {
                user_id: payment.advocate_id,
            },
            data: {
                total_earnings: {
                    increment: payment.amount,
                },
                total_consultations: {
                    increment: 1,
                },
            },
        });

        console.log('Fake payment processed successfully:', session_id);

        return NextResponse.json({
            success: true,
            transaction_id: fakeTransactionId,
            amount: payment.amount,
            message: 'Payment completed successfully (simulated)',
            is_fake_payment: true,
            redirect_url: `/payment/result?success=true&transaction_id=${fakeTransactionId}&amount=${payment.amount}`
        });

    } catch (error) {
        console.error('Fake payment processing error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
