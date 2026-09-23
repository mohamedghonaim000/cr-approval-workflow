import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CrDetailComponent } from './cr-detail.component';
import { SessionService } from '../../session/session.service';
import { users } from '../../api/fixtures';
import { ReqUser } from '../../models/cr.models';
import { CrApiService } from '../../api/cr-api.service';

const flush = () => new Promise((r) => setTimeout(r, 0));

async function render(user: ReqUser, id: string): Promise<ComponentFixture<CrDetailComponent>> {
	TestBed.configureTestingModule({
		imports: [CrDetailComponent],
		providers: [{ provide: SessionService, useValue: { user } }],
	});
	await TestBed.compileComponents();
	const fixture = TestBed.createComponent(CrDetailComponent);
	fixture.componentInstance.id = id;
	fixture.detectChanges(); // ngOnInit -> load()
	await flush(); // let the mock API resolve
	fixture.detectChanges(); // render the loaded state
	return fixture;
}

describe('CrDetailComponent', () => {
	it('loads and renders the change request title', async () => {
		const fixture = await render(users.approver, 'CR-1');
		expect(fixture.nativeElement.querySelector('.cr-detail__header h2').textContent).toContain('Add 1 unit of SKU-A');
	});

	it('disables Approve for a read-only viewer on a pending CR', async () => {
		const fixture = await render(users.viewer, 'CR-1'); // viewer: cr_r_o only; CR-1 is PENDING_APPROVAL
		const approveBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-actions__approve');
		expect(approveBtn.disabled).toBe(true);
	});

	it('renders the approval timeline chronologically', async () => {
		const fixture = await render(users.approver, 'CR-1');

		const actions = Array.from(fixture.nativeElement.querySelectorAll('.cr-timeline__action')).map((element: HTMLElement) =>
			element.textContent?.trim(),
		);

		expect(actions).toEqual(['CREATE', 'SUBMIT', 'SEND_FOR_APPROVAL']);
	});

	it('requires a rejection reason before enabling Reject', async () => {
		const fixture = await render(users.approver, 'CR-1');
		const reason: HTMLTextAreaElement = fixture.nativeElement.querySelector('.cr-actions__reason');
		const rejectButton: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-actions__reject-btn');

		expect(rejectButton.disabled).toBe(true);

		reason.dispatchEvent(new Event('blur'));
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.cr-actions__reason-error')).not.toBeNull();

		reason.value = 'Budget exceeds the approved limit.';
		reason.dispatchEvent(new Event('input'));
		fixture.detectChanges();
		expect(rejectButton.disabled).toBe(false);
	});

	it('approves a pending CR and adds the decision to the timeline', async () => {
		const fixture = await render(users.approver, 'CR-1');
		const approveButton: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-actions__approve');

		approveButton.click();
		fixture.detectChanges();
		expect(approveButton.disabled).toBe(true);

		await flush();
		fixture.detectChanges();

		expect(fixture.nativeElement.querySelector('.cr-status').textContent).toContain('APPROVED');
		const actions = Array.from(fixture.nativeElement.querySelectorAll('.cr-timeline__action')).map((element: HTMLElement) =>
			element.textContent?.trim(),
		);
		expect(actions).toEqual(['CREATE', 'SUBMIT', 'SEND_FOR_APPROVAL', 'APPROVE']);
	});

	it('rejects a pending CR and records the rejection reason', async () => {
		const fixture = await render(users.approver, 'CR-1');
		const reason: HTMLTextAreaElement = fixture.nativeElement.querySelector('.cr-actions__reason');
		const rejectButton: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-actions__reject-btn');

		reason.value = 'Budget exceeds the approved limit.';
		reason.dispatchEvent(new Event('input'));
		fixture.detectChanges();
		rejectButton.click();

		await flush();
		fixture.detectChanges();

		expect(fixture.nativeElement.querySelector('.cr-status').textContent).toContain('REJECTED');
		const entries: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.cr-timeline__entry'));
		expect(entries.at(-1)?.textContent).toContain('REJECT');
		expect(entries.at(-1)?.textContent).toContain('Budget exceeds the approved limit.');
	});

	it('shows an error and allows retry when Approve fails', async () => {
		const fixture = await render(users.approver, 'CR-1');
		const api = fixture.debugElement.injector.get(CrApiService);
		const approveButton: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-actions__approve');
		api.failNext = true;

		approveButton.click();
		fixture.detectChanges();
		expect(approveButton.disabled).toBe(true);

		await flush();
		fixture.detectChanges();

		expect(fixture.nativeElement.querySelector('.cr-actions__error').textContent).toContain('Network error');
		expect(fixture.nativeElement.querySelector('.cr-status').textContent).toContain('PENDING_APPROVAL');
		expect(approveButton.disabled).toBe(false);
	});
});
