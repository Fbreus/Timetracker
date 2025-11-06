# Synergy PSA Integration

The Time Tracker extension now includes integration with Synergy PSA (Professional Services Automation) system, allowing you to submit your tracked time entries directly to Synergy.

## Features

- Submit time entries to Synergy PSA with one click
- Automatic timezone adjustment (Winter/Summer hours)
- Support for customer and project selection
- Automatic fallback from CONSULTANCY to DEVELOPMENT activity type
- Track submission status in the database
- Test Synergy connection before submitting

## Configuration

To enable Synergy integration, configure the following settings in VS Code:

### Required Settings

1. **Enable Synergy Integration**
   ```
   timetracker.synergy.enabled: true
   ```

2. **Resource ID** (Your employee ID in Synergy)
   ```
   timetracker.synergy.resourceId: <your-employee-id>
   ```

### Optional Settings

All endpoint URLs are pre-configured with default values, but you can customize them if needed:

- `timetracker.synergy.apiEndpoint`: Synergy API endpoint
- `timetracker.synergy.tokenEndpoint`: Token authentication endpoint
- `timetracker.synergy.winterHourCheckEndpoint`: Winter hour check endpoint
- `timetracker.synergy.customersEndpoint`: Customers list endpoint
- `timetracker.synergy.projectsEndpoint`: Projects list endpoint
- `timetracker.synergy.defaultCustomerId`: Default customer GUID
- `timetracker.synergy.defaultProject`: Default project code
- `timetracker.synergy.defaultActivity`: Default activity type (CONSULTANCY or DEVELOPMENT)
- `timetracker.synergy.autoSubmit`: Automatically submit when stopping tracking

## How to Use

### Method 1: Submit from Sidebar

1. Open the Time Tracker sidebar
2. Click on "Submit to Synergy" in the Actions section
3. Select the time entry you want to submit
4. Enter description and remarks
5. Optionally specify a custom project
6. Click submit

### Method 2: Submit via Command Palette

1. Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
2. Type "Time Tracker: Submit to Synergy PSA"
3. Follow the prompts

### Method 3: Test Connection

1. Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
2. Type "Time Tracker: Test Synergy Connection"
3. Check if the connection is successful

## Submission Flow

When you submit a time entry to Synergy, the following happens:

1. **Timezone Adjustment**: The system checks if winter or summer hour adjustment is needed
2. **Authentication**: Obtains an access token from Synergy
3. **Submission**: Sends the time entry with:
   - Activity type (CONSULTANCY or DEVELOPMENT)
   - Customer ID
   - Project number
   - Date (adjusted for timezone)
   - Description
   - Hours worked
   - Internal and external remarks
   - Resource ID
4. **Fallback**: If submission fails with 404 error and activity is CONSULTANCY, automatically retries with DEVELOPMENT
5. **Database Update**: Marks the entry as submitted in the local database

## Database Schema

The following fields are added to the `time_entries` table:

- `synergy_submitted`: Boolean flag indicating if submitted
- `synergy_submission_date`: Timestamp of submission
- `synergy_customer_id`: Customer ID used for submission
- `synergy_project_no`: Project number used for submission
- `synergy_response`: JSON response from Synergy API

## API Integration Details

### Based on Azure Logic App Workflow

This integration is based on the Azure Logic App workflow for handling Teams call records. The following endpoints are used:

1. **Token Endpoint**: Returns bearer token for authentication
2. **Winter Hour Check**: Determines if winter hour (UTC+1) or summer hour (UTC+2) adjustment is needed
3. **Customers Endpoint**: Returns list of customers for a resource
4. **Projects Endpoint**: Returns list of projects for an employee
5. **API Endpoint**: Submits time entry to Synergy PSA

### Request Body Structure

```json
{
  "Activity": "CONSULTANCY" | "DEVELOPMENT",
  "CustomerID": "customer-guid",
  "Date": "ISO-date-string",
  "Description": "Work description",
  "ExternalRemarks": "Customer-facing notes",
  "Hours": 2.5,
  "HoursRealized": 2.5,
  "InternalRemarks": "Internal notes",
  "Project": "PROJECT-CODE",
  "ResourceID": 123
}
```

## Error Handling

- **404 Error**: Automatically retries with DEVELOPMENT activity if CONSULTANCY fails
- **Network Errors**: Displays error message with details
- **Authentication Errors**: Token is cached for 1 hour and refreshed automatically
- **Missing Resource ID**: Prompts user to configure resource ID in settings

## Tips

1. **Always test connection first**: Use "Test Synergy Connection" command before submitting
2. **Configure Resource ID**: This is required for submissions to work
3. **Use descriptive notes**: Add detailed descriptions and remarks for better tracking
4. **Review before submitting**: Time entries can be reviewed in the "View Entries" section
5. **Check submission status**: Already submitted entries won't appear in the submission list

## Troubleshooting

### "Synergy integration is not enabled"
- Enable it in settings: `timetracker.synergy.enabled: true`

### "Resource ID is not configured"
- Set your employee ID: `timetracker.synergy.resourceId: <your-id>`

### "Connection test failed"
- Check network connectivity
- Verify endpoint URLs in settings
- Check if you have access to Synergy API

### "Failed to submit to Synergy: 404"
- The project might not support the selected activity type
- System will automatically retry with DEVELOPMENT if CONSULTANCY fails

### "No time entries to submit"
- All completed entries are already submitted
- Create new time entries or check if tracking is active

## Security Notes

- Authentication tokens are cached in memory for 1 hour
- Tokens are never stored in the database
- All API calls use HTTPS
- Sensitive data is only transmitted to configured endpoints

## Support

For issues or questions about Synergy integration:
1. Check the [GitHub Issues](https://github.com/Fbreus/Timetracker/issues)
2. Review this documentation
3. Check VS Code extension logs for detailed error messages
