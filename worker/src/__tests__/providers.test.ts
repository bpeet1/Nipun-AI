import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateSecondOpinion } from '../cerebras';
import { auditReport } from '../cohere';
import type { FinancialData, SentimentResult, RiskFactor, Catalyst } from '../types';

const financials: FinancialData = {
    ticker: 'AAPL',
    companyName: 'Apple Inc.',
    price: 180,
    change: 2,
    changePercent: 1.1,
    open: 178,
    high: 181,
    low: 177,
    previousClose: 178,
    volume: 1000000,
    marketCap: 1000000000,
    pe: 28,
    eps: 6.4,
    beta: 1.2,
    weekHigh52: 199,
    weekLow52: 140,
    revenue: 100000000,
    grossMargin: 44,
    debtToEquity: 1.1,
    dividendYield: 0.5,
    sector: 'Technology',
};

const sentiment: SentimentResult = {
    bullishPercent: 60,
    bearishPercent: 20,
    neutralPercent: 20,
    totalPosts: 10,
    posts: [],
    themes: ['Earnings momentum'],
};

const risks: RiskFactor[] = [{ category: 'macro', description: 'Rates risk', severity: 'medium' }];
const catalysts: Catalyst[] = [{ type: 'earnings', description: 'Earnings beat', timeline: 'Q2' }];

describe('provider API contracts', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('uses supported Cerebras model and parses JSON response', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [
                    {
                        message: {
                            content: JSON.stringify({
                                verdict: 'bullish',
                                confidence: 0.8,
                                keyReasons: ['strong profitability'],
                                contrarian_view: 'valuation risk',
                            }),
                        },
                    },
                ],
            }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const result = await generateSecondOpinion(financials, sentiment, risks, catalysts, 'Overall this looks bullish', 'cb_key');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
        const body = JSON.parse(String(request.body)) as { model: string; response_format: { type: string } };
        expect(body.model).toBe('gpt-oss-120b');
        expect(body.response_format.type).toBe('json_object');
        expect(result.secondaryModel).toBe('Cerebras GPT OSS 120B');
    });

    it('uses Cohere v2 model and data.text documents shape', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                message: {
                    content: [
                        {
                            text: JSON.stringify({
                                claims: [
                                    { claim: 'Apple has strong margins', status: 'grounded', source: 'finnhub-data' },
                                    { claim: 'Stock may double', status: 'speculative', source: 'N/A' },
                                ],
                            }),
                        },
                    ],
                },
            }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const result = await auditReport('Sample report text', financials, 'co_key');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
        const body = JSON.parse(String(request.body)) as {
            model: string;
            documents: Array<{ id: string; data: { text: string } }>;
        };
        expect(body.model).toBe('command-a-03-2025');
        expect(body.documents[0].data.text).toContain('Verified Financial Data');
        expect(result.groundedCount).toBe(1);
        expect(result.speculativeCount).toBe(1);
    });
});

