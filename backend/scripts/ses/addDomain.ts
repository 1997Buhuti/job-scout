#!/usr/bin/env node
import { SESv2Client, CreateEmailIdentityCommand, GetEmailIdentityCommand } from '@aws-sdk/client-sesv2';

/**
 * Add a sender domain to SES with DKIM signing.
 * 
 * Usage: npx ts-node scripts/ses/addDomain.ts <domain>
 * Example: npx ts-node scripts/ses/addDomain.ts jobscout.dynv6.net
 * 
 * Prints the DNS records to add for verification and DKIM.
 * If the identity already exists, prints its current status.
 */
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    console.error('Usage: npx ts-node scripts/ses/addDomain.ts <domain>');
    console.error('Example: npx ts-node scripts/ses/addDomain.ts jobscout.dynv6.net');
    process.exit(1);
  }

  const domain = args[0];
  const region = process.env.AWS_REGION || 'us-east-1';
  
  console.log(`Adding ${domain} to SES in ${region}...`);

  const client = new SESv2Client({ region });

  try {
    // Try to create the identity first
    const createCommand = new CreateEmailIdentityCommand({
      EmailIdentity: domain,
      // Easy DKIM: SES generates and rotates the key; we publish 3 CNAMEs.
      DkimSigningAttributes: {
        NextSigningKeyLength: 'RSA_2048_BIT',
      },
      Tags: [
        {
          Key: 'CreatedBy',
          Value: 'job-scout-ses-add-domain',
        },
      ],
    });

    try {
      await client.send(createCommand);
      console.log(`✅ Created SES identity for ${domain}`);
      console.log(`Identity created successfully`);
      
      // New identity - get the DKIM tokens
      await printDnsRecords(client, domain, true);
    } catch (createError: unknown) {
      if (toError(createError).name === 'AlreadyExistsException') {
        console.log(`ℹ️ Identity for ${domain} already exists. Checking current status...`);
        // Identity exists - get current status and DKIM tokens
        await printDnsRecords(client, domain, false);
      } else {
        throw createError;
      }
    }
  } catch (caught: unknown) {
    const error = toError(caught);
    console.error(`❌ Error: ${error.message}`);
    
    if (error.name === 'AccessDeniedException') {
      console.error('\nMake sure your AWS credentials have ses:CreateEmailIdentity permission.');
      console.error('Check AWS_PROFILE or run with appropriate IAM role.');
    } else if (error.name === 'ValidationException' && error.message.includes('FAILED')) {
      console.error('\nThis identity may be stuck in FAILED state.');
      console.error('To restart verification:');
      console.error('1. Delete the identity in SES console or with DeleteEmailIdentity');
      console.error('2. Run this script again');
    }
    
    process.exit(1);
  }
}

async function printDnsRecords(client: SESv2Client, domain: string, isNew: boolean) {
  try {
    const getCommand = new GetEmailIdentityCommand({ EmailIdentity: domain });
    const identity = await client.send(getCommand);
    
    console.log('\n=== Domain Status ===');
    console.log(`Verification Status: ${identity.VerificationStatus || 'UNKNOWN'}`);
    console.log(`DKIM Status: ${identity.DkimAttributes?.Status || 'UNKNOWN'}`);
    console.log(`Sending Ready: ${identity.VerifiedForSendingStatus || 'UNKNOWN'}`);
    
    if (identity.VerificationStatus === 'FAILED') {
      console.log('\n⚠️  Verification FAILED. Records may have expired or were never published.');
      console.log('To restart: delete this identity and run the script again.');
    }
    
    // Print DKIM records
    const dkimTokens = identity.DkimAttributes?.Tokens;
    if (dkimTokens && dkimTokens.length > 0) {
      console.log('\n=== DKIM Records to Add (CNAME) ===');
      console.log('Add these records at your DNS host:');
      
      dkimTokens.forEach((token: string, index: number) => {
        const recordName = `${token}._domainkey.${domain}`;
        // Trailing dot: without it, hosts like dynv6 append the zone name.
        const recordValue = `${token}.dkim.amazonses.com.`;
        console.log(`\n${index + 1}. ${recordName}`);
        console.log(`   Type: CNAME`);
        console.log(`   Value: ${recordValue}`);
        console.log(`   TTL: 1800 (or your default)`);
      });
    } else {
      console.log('\n⚠️  No DKIM tokens found. DKIM may not be enabled for this domain.');
    }
    
    // Print DMARC record
    console.log('\n=== DMARC Record (TXT) ===');
    console.log(`Add this TXT record at: _dmarc.${domain}`);
    console.log(`Value: v=DMARC1; p=none;`);
    console.log(`(Optional) add rua=mailto:<an inbox you read> to receive DMARC reports.`);
    console.log(`TTL: 1800 (or your default)`);
    
    // Print SPF record for MAIL FROM domain if configured
    if (identity.MailFromAttributes?.MailFromDomain) {
      const mailFromDomain = identity.MailFromAttributes.MailFromDomain;
      console.log('\n=== MAIL FROM Domain Records ===');
      console.log(`MAIL FROM domain: ${mailFromDomain}`);
      
      console.log('\nMX Record:');
      console.log(`  Name: ${mailFromDomain}`);
      console.log(`  Type: MX`);
      console.log(`  Value: 10 feedback-smtp.us-east-1.amazonses.com`);
      console.log(`  TTL: 1800`);
      
      console.log('\nSPF Record (TXT):');
      console.log(`  Name: ${mailFromDomain}`);
      console.log(`  Type: TXT`);
      console.log(`  Value: "v=spf1 include:amazonses.com ~all"`);
      console.log(`  TTL: 1800`);
    } else {
      console.log('\nℹ️  No custom MAIL FROM domain configured.');
      console.log('SES will use the default MAIL FROM domain.');
    }
    
    console.log('\n=== Next Steps ===');
    console.log('1. Add all DNS records above at your DNS host');
    console.log('2. Run the check-domain script to verify:');
    console.log(`   npx ts-node scripts/ses/checkDomain.ts ${domain}`);
    console.log('3. Wait for DNS propagation (can take up to 48 hours)');
    console.log('4. Run check-domain until Verification Status shows SUCCESS');
    
    if (isNew) {
      console.log('\n⚠️  IMPORTANT: New identities may need warm-up time.');
      console.log('Start with low volume sending to build domain reputation.');
    }
    
  } catch (error: unknown) {
    console.error(`Error getting identity details: ${toError(error).message}`);
  }
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});