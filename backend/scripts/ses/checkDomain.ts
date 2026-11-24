#!/usr/bin/env node
import { SESv2Client, GetEmailIdentityCommand } from '@aws-sdk/client-sesv2';

/**
 * Check the status of an SES domain identity.
 * 
 * Usage: npx ts-node scripts/ses/checkDomain.ts <domain>
 * Example: npx ts-node scripts/ses/checkDomain.ts jobscout.dynv6.net
 * 
 * Prints verification, DKIM, and sending status, and lists missing records.
 */
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    console.error('Usage: npx ts-node scripts/ses/checkDomain.ts <domain>');
    console.error('Example: npx ts-node scripts/ses/checkDomain.ts jobscout.dynv6.net');
    process.exit(1);
  }

  const domain = args[0];
  const region = process.env.AWS_REGION || 'us-east-1';
  
  console.log(`Checking ${domain} in SES ${region}...`);

  const client = new SESv2Client({ region });

  try {
    const command = new GetEmailIdentityCommand({ EmailIdentity: domain });
    const identity = await client.send(command);

    console.log('\n=== Domain Identity Status ===');
    console.log(`Domain: ${domain}`);
    console.log(`Identity ARN: ${(identity as any).IdentityArn || 'Not available'}`);
    console.log(`Created: ${(identity as any).CreatedTimestamp?.toISOString() || 'Unknown'}`);
    
    // Verification Status
    const verificationStatus = identity.VerificationStatus || 'UNKNOWN';
    console.log(`\n📊 Verification Status: ${verificationStatus}`);
    console.log(`   ${getVerificationDescription(verificationStatus)}`);
    
    // DKIM Status
    const dkimStatus = identity.DkimAttributes?.Status || 'UNKNOWN';
    console.log(`\n🔐 DKIM Status: ${dkimStatus}`);
    console.log(`   ${getDkimDescription(dkimStatus)}`);
    
    // Sending Status
    const canSend = identity.VerifiedForSendingStatus === true;
    console.log(`\n✉️  Sending Ready: ${canSend ? 'YES' : 'NO'}`);
    
    // Overall readiness
    const isReady = verificationStatus === 'SUCCESS' && 
                   dkimStatus === 'SUCCESS' && 
                   canSend;
    
    console.log(`\n${isReady ? '✅' : '⚠️'} Domain ${isReady ? 'READY' : 'NOT READY'} for sending`);
    
    // Missing records
    console.log('\n=== Missing Records Check ===');
    const missingRecords = checkMissingRecords(identity);
    
    if (missingRecords.length === 0) {
      console.log('✅ All required DNS records appear to be published.');
    } else {
      console.log('❌ Missing or incorrect DNS records:');
      missingRecords.forEach(record => {
        console.log(`\n${record.type}: ${record.name}`);
        console.log(`   Expected: ${record.expected}`);
        console.log(`   Issue: ${record.issue}`);
      });
      
      console.log('\nRun the add-domain script to see the exact records to publish:');
      console.log(`npx ts-node scripts/ses/addDomain.ts ${domain}`);
    }
    
    // DKIM tokens if available
    const dkimTokens = identity.DkimAttributes?.Tokens;
    if (dkimTokens && dkimTokens.length > 0) {
      console.log('\n=== DKIM Configuration ===');
      console.log(`DKIM Selector: ses (default)`);
      console.log(`Key Length: Easy DKIM (AWS-managed)`);
      
      console.log('\nDKIM Tokens (for reference):');
      dkimTokens.forEach((token: string, index: number) => {
        console.log(`  ${index + 1}. ${token}`);
      });
    }
    
    // MAIL FROM domain
    if (identity.MailFromAttributes?.MailFromDomain) {
      console.log('\n=== MAIL FROM Domain ===');
      console.log(`Domain: ${identity.MailFromAttributes.MailFromDomain}`);
      console.log(`Status: ${identity.MailFromAttributes.MailFromDomainStatus || 'UNKNOWN'}`);
    }
    
    console.log('\n=== Recommendations ===');
    if (!isReady) {
      if (verificationStatus === 'FAILED') {
        console.log('• Verification FAILED - you may need to delete and recreate the identity');
        console.log('• Check that DNS records were published correctly');
      }
      
      if (dkimStatus !== 'SUCCESS') {
        console.log('• DKIM not successful - verify CNAME records are correct');
      }
      
      if (!canSend) {
        console.log('• Domain not verified for sending - complete verification first');
      }
    } else {
      console.log('• Domain is ready for sending!');
      console.log('• Set SES_FROM_ADDRESS to an email on this domain');
      console.log('• Start with low volume to build reputation');
    }
    
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
    
    if (error.name === 'NotFoundException') {
      console.error(`\nDomain ${domain} not found in SES.`);
      console.error('Create it first with:');
      console.error(`npx ts-node scripts/ses/addDomain.ts ${domain}`);
    } else if (error.name === 'AccessDeniedException') {
      console.error('\nPermission denied. Make sure your AWS credentials have ses:GetEmailIdentity permission.');
    }
    
    process.exit(1);
  }
}

function getVerificationDescription(status: string): string {
  const descriptions: Record<string, string> = {
    'PENDING': 'DNS records not yet verified or propagation in progress',
    'SUCCESS': 'Domain verified and ready',
    'FAILED': 'Verification failed - check DNS records',
    'TEMPORARY_FAILURE': 'Temporary failure - retry later',
    'NOT_STARTED': 'Verification not started',
    'UNKNOWN': 'Status unknown'
  };
  return descriptions[status] || 'Unknown status';
}

function getDkimDescription(status: string): string {
  const descriptions: Record<string, string> = {
    'PENDING': 'DKIM setup in progress',
    'SUCCESS': 'DKIM signing enabled',
    'FAILED': 'DKIM failed - check CNAME records',
    'NOT_STARTED': 'DKIM not configured',
    'UNKNOWN': 'DKIM status unknown'
  };
  return descriptions[status] || 'Unknown status';
}

function checkMissingRecords(identity: any): Array<{type: string, name: string, expected: string, issue: string}> {
  const missing: Array<{type: string, name: string, expected: string, issue: string}> = [];
  
  // Check verification status
  if (identity.VerificationStatus === 'PENDING' || identity.VerificationStatus === 'FAILED') {
    missing.push({
      type: 'Verification',
      name: 'Domain verification',
      expected: 'SUCCESS status',
      issue: `Current status: ${identity.VerificationStatus}`
    });
  }
  
  // Check DKIM status
  if (identity.DkimAttributes?.Status === 'PENDING' || identity.DkimAttributes?.Status === 'FAILED') {
    missing.push({
      type: 'DKIM',
      name: 'DKIM verification',
      expected: 'SUCCESS status',
      issue: `Current status: ${identity.DkimAttributes?.Status}`
    });
  }
  
  // Check MAIL FROM domain if configured
  if (identity.MailFromAttributes?.MailFromDomain) {
    const mailFromStatus = identity.MailFromAttributes.MailFromDomainStatus;
    if (mailFromStatus !== 'SUCCESS') {
      missing.push({
        type: 'MAIL FROM',
        name: `MX and SPF records for ${identity.MailFromAttributes.MailFromDomain}`,
        expected: 'MX to feedback-smtp.us-east-1.amazonses.com and TXT "v=spf1 include:amazonses.com ~all"',
        issue: `MAIL FROM status: ${mailFromStatus}`
      });
    }
  }
  
  return missing;
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});