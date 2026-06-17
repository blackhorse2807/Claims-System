const fs = require('fs');
const path = require('path');

const POLICY_PATH = path.join(__dirname, '..', 'policy_terms.json');

let cachedPolicy = null;

function loadPolicy() {
  if (cachedPolicy) {
    return cachedPolicy;
  }
  const raw = fs.readFileSync(POLICY_PATH, 'utf8');
  cachedPolicy = JSON.parse(raw);
  return cachedPolicy;
}

function getPolicy() {
  return loadPolicy();
}

function getMember(memberId) {
  const policy = loadPolicy();
  const members = policy.members || [];
  return members.find((m) => m.member_id === memberId || m.id === memberId) || null;
}

function getCoverageCategory(category) {
  const policy = loadPolicy();
  const opdCategories = policy.opd_categories || {};
  return opdCategories[category.toLowerCase()] || null;
}

// Map diagnosis text keywords to specific_conditions keys in policy_terms.json
const WAITING_PERIOD_RULES = [
  { keywords: ['diabet'], conditionKey: 'diabetes' },
  { keywords: ['hypertens'], conditionKey: 'hypertension' },
  { keywords: ['thyroid'], conditionKey: 'thyroid_disorders' },
  { keywords: ['joint', 'replacement'], conditionKey: 'joint_replacement' },
  { keywords: ['matern', 'pregnan'], conditionKey: 'maternity' },
  { keywords: ['mental', 'psych', 'depress', 'anxiety'], conditionKey: 'mental_health' },
  { keywords: ['obes', 'weight loss', 'bariatric'], conditionKey: 'obesity_treatment' },
  { keywords: ['hernia'], conditionKey: 'hernia' },
  { keywords: ['cataract'], conditionKey: 'cataract' },
];

function getWaitingPeriod(diagnosisText) {
  const policy = loadPolicy();
  const waitingPeriods = policy.waiting_periods || {};
  const specificConditions = waitingPeriods.specific_conditions || {};
  const diagnosis = (diagnosisText || '').toLowerCase();

  for (const rule of WAITING_PERIOD_RULES) {
    for (const keyword of rule.keywords) {
      if (diagnosis.includes(keyword)) {
        // "Lumbar Disc Herniation" is not the same as a hernia surgery waiting period
        if (keyword === 'hernia' && diagnosis.includes('herniation')) {
          continue;
        }
        if (specificConditions[rule.conditionKey] !== undefined) {
          return specificConditions[rule.conditionKey];
        }
      }
    }
  }

  return waitingPeriods.initial_waiting_period_days;
}

function isNetworkHospital(hospitalName) {
  const policy = loadPolicy();
  const hospitals = policy.network_hospitals || [];
  const name = (hospitalName || '').toLowerCase().trim();

  if (!name) {
    return false;
  }

  return hospitals.some((hospital) => {
    const networkName = (typeof hospital === 'string' ? hospital : hospital.name || '')
      .toLowerCase()
      .trim();
    return networkName.includes(name) || name.includes(networkName);
  });
}

function getRequiredDocs(claimCategory) {
  const policy = loadPolicy();
  const requirements = policy.document_requirements || {};
  const categoryReqs = requirements[claimCategory] || {};

  return {
    required: categoryReqs.required || [],
    optional: categoryReqs.optional || [],
  };
}

function getFraudThresholds() {
  const policy = loadPolicy();
  return policy.fraud_thresholds || {};
}

module.exports = {
  getPolicy,
  getMember,
  getCoverageCategory,
  getWaitingPeriod,
  isNetworkHospital,
  getRequiredDocs,
  getFraudThresholds,
};
