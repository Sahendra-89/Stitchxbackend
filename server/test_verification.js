async function runVerification() {
  const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log('PASS: ' + message);
      passed++;
    } else {
      console.error('FAIL: ' + message);
      failed++;
    }
  }

  console.log('=== STARTING TECHFUSION VERIFICATION SUITE ===\n');

  // Test 1: Unauthorized access to admin endpoints
  const unauthStats = await fetch(baseUrl + '/api/admin/dashboard-stats');
  assert(unauthStats.status === 401, 'Unauthorized request to /api/admin/dashboard-stats returns 401');

  const unauthEnquiries = await fetch(baseUrl + '/api/admin/enquiries');
  assert(unauthEnquiries.status === 401, 'Unauthorized request to /api/admin/enquiries returns 401');

  const unauthResume = await fetch(baseUrl + '/api/admin/applications/1/resume');
  assert(unauthResume.status === 401, 'Unauthorized request to resume download returns 401');

  // Test 2: Admin Login
  const loginRes = await fetch(baseUrl + '/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'AdminPassword2026!' })
  });
  const loginData = await loginRes.json();
  assert(loginData.success === true && Boolean(loginData.token), 'Admin login succeeds with default credentials');
  const token = loginData.token;
  const authHeaders = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };

  // Test 3: Public reviews only shows approved & published
  const publicReviewsBefore = await fetch(baseUrl + '/api/reviews').then(r => r.json());
  const beforeCount = publicReviewsBefore.reviews.length;
  assert(beforeCount >= 5, 'Baseline seeded reviews returned to public: ' + beforeCount);

  // Test 4: Public review submission defaults to pending & not published
  const publicSubmitRes = await fetch(baseUrl + '/api/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Unverified Test Client',
      role: 'Tester',
      company: 'TestCorp',
      review: 'This is a test submission that must not show publicly before admin approval.',
      rating: 5
    })
  });
  const publicSubmitData = await publicSubmitRes.json();
  assert(publicSubmitData.success === true, 'Public review submission accepted with pending notice');

  // Verify it does NOT appear on public website
  const publicReviewsAfter = await fetch(baseUrl + '/api/reviews').then(r => r.json());
  const foundUnapproved = publicReviewsAfter.reviews.some(r => r.name === 'Unverified Test Client');
  assert(!foundUnapproved, 'Unapproved review is HIDDEN from public website');

  // Test 5: Admin can see pending review and approve & publish it
  const adminReviewsRes = await fetch(baseUrl + '/api/admin/reviews?status=pending', { headers: authHeaders }).then(r => r.json());
  const pendingRev = adminReviewsRes.reviews.find(r => r.name === 'Unverified Test Client');
  assert(Boolean(pendingRev), 'Admin sees pending review in Admin Reviews Module');

  if (pendingRev) {
    // Approve and publish
    await fetch(baseUrl + '/api/admin/reviews/' + pendingRev.id + '/status', {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ status: 'approved' })
    });
    await fetch(baseUrl + '/api/admin/reviews/' + pendingRev.id + '/publish', {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ is_published: 1 })
    });

    const publicAfterApproval = await fetch(baseUrl + '/api/reviews').then(r => r.json());
    const nowVisible = publicAfterApproval.reviews.some(r => r.name === 'Unverified Test Client');
    assert(nowVisible, 'Approved and published review now appears on public website');

    // Clean up test review
    await fetch(baseUrl + '/api/admin/reviews/' + pendingRev.id, { method: 'DELETE', headers: authHeaders });
  }

  // Test 6: Blog Management - Create draft, verify not public, publish, verify public by slug
  const testSlug = 'automated-test-article-' + Date.now();
  const createBlogRes = await fetch(baseUrl + '/api/admin/blog', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      title: 'Automated Test Article',
      slug: testSlug,
      category: 'Testing',
      author: 'Test Engineer',
      content: '<p>This is a test draft article content.</p>',
      status: 'draft',
      is_published: 0
    })
  }).then(r => r.json());
  assert(createBlogRes.success === true, 'Admin successfully created draft blog post');

  // Verify draft is NOT public
  const publicBlogDraft = await fetch(baseUrl + '/api/blog/' + testSlug);
  assert(publicBlogDraft.status === 404, 'Draft blog post returns 404 on public URL');

  // Publish blog post
  await fetch(baseUrl + '/api/admin/blog/' + createBlogRes.post.id + '/publish', {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({ is_published: 1 })
  });

  // Verify published blog post is now public
  const publicBlogPublished = await fetch(baseUrl + '/api/blog/' + testSlug).then(r => r.json());
  assert(publicBlogPublished.success === true && publicBlogPublished.post.slug === testSlug, 'Published blog opens successfully with slug URL');

  // Clean up test blog post
  await fetch(baseUrl + '/api/admin/blog/' + createBlogRes.post.id, { method: 'DELETE', headers: authHeaders });

  // Test 7: Careers Management - Submit Job Application
  const testApplyRes = await fetch(baseUrl + '/api/jobs/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jobId: 'frontend-developer',
      fullName: 'Jane Candidate',
      email: 'jane.candidate@example.com',
      phone: '+1 555-0199',
      experience: '4 Years',
      resumeUrl: 'https://linkedin.com/in/jane-candidate-resume',
      portfolioUrl: 'https://github.com/janecandidate'
    })
  }).then(r => r.json());
  assert(testApplyRes.success === true, 'Candidate job application submitted and saved successfully');

  // Verify admin can view applications
  const adminApps = await fetch(baseUrl + '/api/admin/applications', { headers: authHeaders }).then(r => r.json());
  const createdApp = adminApps.applications.find(a => a.email === 'jane.candidate@example.com');
  assert(Boolean(createdApp), 'Admin can view saved job application in database');

  if (createdApp) {
    // Admin updates status to Shortlisted and adds internal notes
    const updateAppRes = await fetch(baseUrl + '/api/admin/applications/' + createdApp.id, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ status: 'Shortlisted', internal_notes: 'Strong React 19 portfolio.' })
    }).then(r => r.json());
    assert(updateAppRes.application.status === 'Shortlisted' && updateAppRes.application.internal_notes.includes('React 19'), 'Admin can update status and internal notes on application');

    // Admin downloads/views resume
    const appResume = await fetch(baseUrl + '/api/admin/applications/' + createdApp.id + '/resume', { headers: authHeaders }).then(r => r.json());
    assert(Boolean(appResume.externalUrl), 'Admin securely accesses candidate resume');

    // Clean up test application
    await fetch(baseUrl + '/api/admin/applications/' + createdApp.id, { method: 'DELETE', headers: authHeaders });
  }

  // Test 8: Contact Management - Submit Enquiry and Admin Follow-up
  const testEnquiryRes = await fetch(baseUrl + '/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: 'Alice',
      lastName: 'Smith',
      businessEmail: 'alice.smith@enterprise.com',
      phoneNumber: '+1 555-9876',
      companyName: 'Enterprise Logistics',
      service: 'Cloud Workflow & Business Automation',
      budget: '$25,000 - $50,000 USD',
      projectDetails: 'We require automated shipment reconciliation and webhook queues with SAP.'
    })
  }).then(r => r.json());
  assert(testEnquiryRes.success === true, 'Contact enquiry submitted and saved successfully');

  // Verify admin can view enquiries
  const adminEnquiries = await fetch(baseUrl + '/api/admin/enquiries', { headers: authHeaders }).then(r => r.json());
  const foundEnq = adminEnquiries.enquiries.find(e => e.email === 'alice.smith@enterprise.com');
  assert(Boolean(foundEnq), 'Contact inquiry securely saved in database for admin review');

  if (foundEnq) {
    // Admin updates status to Contacted, adds assigned agent and private notes
    const updateEnqRes = await fetch(baseUrl + '/api/admin/enquiries/' + foundEnq.id, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ status: 'Contacted', assigned_to: 'Alex Lead', private_notes: 'Intro call scheduled for Thursday.' })
    }).then(r => r.json());
    assert(updateEnqRes.enquiry.status === 'Contacted' && updateEnqRes.enquiry.assigned_to === 'Alex Lead', 'Admin can update status, assign agent, and save private notes');

    // Clean up test enquiry
    await fetch(baseUrl + '/api/admin/enquiries/' + foundEnq.id, { method: 'DELETE', headers: authHeaders });
  }

  // Test 9: Contact Settings - update from admin and verify on public /api/contact/info
  const updateSettingsRes = await fetch(baseUrl + '/api/admin/contact-settings', {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({
      email: 'engineering@techfusion.global',
      phone: '+91 93416 60370',
      address: 'TechFusion HQ, Cyber City, Gurugram, India',
      business_hours: 'Mon - Fri, 9:00 AM - 6:00 PM IST',
      social_links: { linkedin: 'https://linkedin.com/company/techfusion' }
    })
  }).then(r => r.json());
  assert(updateSettingsRes.success === true, 'Admin successfully updated contact settings');

  // Verify on public API
  const publicContactInfo = await fetch(baseUrl + '/api/contact/info').then(r => r.json());
  assert(publicContactInfo.contact.email === 'engineering@techfusion.global', 'Public contact info reflects updated settings: ' + publicContactInfo.contact.email);

  // Restore baseline email
  await fetch(baseUrl + '/api/admin/contact-settings', {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({
      email: 'sahendra2976@gmail.com',
      phone: '+91 93416 60370',
      address: 'Tower A, 3rd Floor, Unitech Cyber Park, Sector 39, Gurugram, Haryana, India',
      business_hours: 'Mon - Fri, 9:00 AM - 6:00 PM IST',
      social_links: { linkedin: 'https://linkedin.com/company/techfusion' }
    })
  });

  console.log(`\n=== ALL TESTS FINISHED: ${passed} PASSED, ${failed} FAILED ===`);
}

runVerification().catch(console.error);
