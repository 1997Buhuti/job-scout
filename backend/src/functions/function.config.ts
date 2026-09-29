export const corsHeaders = [
  'Content-Type',
  'X-Amz-Date',
  'Authorization',
  'X-Api-Key',
  'X-Amz-Security-Token',
  'X-Amz-User-Agent',
];

export const corsSettings = {
  headers: corsHeaders,
  origin: '*',
  maxAge: 86400,
};
