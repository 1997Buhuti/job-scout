import type { APIGatewayProxyEventV2 } from 'aws-lambda';

import { UNSUBSCRIBE_SERVICE } from '@common/constants';
import { BadRequestError, sendErrorResponse } from '@common/ErrorTypes';
import { Logger } from '@common/logger';
import wrapper from '@common/middyWrapper';

import { unsubscribe } from './unsubscribe';

const logger = new Logger(UNSUBSCRIBE_SERVICE);

export const main = wrapper<APIGatewayProxyEventV2>(async (event, _context) => {
  const token = event.queryStringParameters?.token;

  if (!token) {
    return sendErrorResponse(
      new BadRequestError('Missing required parameter: token'),
      logger,
      'Unsubscribe',
    );
  }

  try {
    const result = await unsubscribe({ token });

    // Return an HTML page (AC-12: confirmation/error page)
    const status = result.success ? 200 : 400;
    const html = buildHtmlPage(result.message, result.success);
    return {
      statusCode: status,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: html,
    };
  } catch (err) {
    return sendErrorResponse(err, logger, 'Unsubscribe');
  }
});

const buildHtmlPage = (message: string, success: boolean): string => {
  const title = success ? 'Unsubscribe successful' : 'Unsubscribe failed';
  const color = success ? '#22c55e' : '#ef4444';
  const icon = success ? '✓' : '✗';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 600px;
      margin: 40px auto;
      padding: 0 16px;
      color: #1f2937;
    }
    .card {
      background: #f9fafb;
      border-radius: 8px;
      padding: 32px;
      text-align: center;
      border: 1px solid #e5e7eb;
    }
    .icon {
      font-size: 48px;
      margin-bottom: 16px;
      color: ${color};
    }
    h1 {
      font-size: 24px;
      margin: 0 0 12px;
    }
    p {
      margin: 0;
      line-height: 1.5;
      color: #4b5563;
    }
    .back {
      margin-top: 24px;
    }
    .back a {
      color: #2563eb;
      text-decoration: none;
      font-weight: 500;
    }
    .back a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <div class="back">
      <a href="https://job-scout.app/dashboard">Return to dashboard</a>
    </div>
  </div>
</body>
</html>
`;
};
