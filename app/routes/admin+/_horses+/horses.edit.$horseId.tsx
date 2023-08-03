import { useState } from 'react'
import {
	Dialog,
	DialogHeader,
	DialogContent,
	DialogDescription,
	DialogClose,
	DialogTitle,
	DialogFooter,
} from '~/components/ui/dialog.tsx'
import { Icon } from '~/components/ui/icon.tsx'
import { CheckboxField, Field, TextareaField, ErrorList } from '~/components/forms.tsx'
import {
	Form,
	useLoaderData,
	useNavigate,
	useActionData,
	useNavigation,
	useFormAction,
} from '@remix-run/react'
import { json, type DataFunctionArgs } from '@remix-run/node'
import { requireAdmin } from '~/utils/permissions.server.ts'
import { prisma } from '~/utils/db.server.ts'
import invariant from 'tiny-invariant'
import { conform, useForm } from '@conform-to/react'
import { parse } from '@conform-to/zod'
import { horseFormSchema } from './horses.tsx'
import { redirectWithToast } from '~/utils/flash-session.server.ts'
import { StatusButton } from '~/components/ui/status-button.tsx'
import { format } from 'date-fns'

export const loader = async ({ request, params }: DataFunctionArgs) => {
	await requireAdmin(request)
	invariant(params.horseId, 'Missing horse id')
	const horse = await prisma.horse.findUnique({ where: { id: params.horseId } })
	if (!horse) {
		throw new Response('not found', { status: 404 })
	}
	return json({ horse })
}

export async function action({ request, params }: DataFunctionArgs) {
	await requireAdmin(request)
	invariant(params.horseId, 'Missing horse id')
	const formData = await request.formData()
	const submission = await parse(formData, {
		async: true,
		schema: horseFormSchema,
		acceptMultipleErrors: () => true,
	})

	if (submission.intent !== 'submit') {
		return json({ status: 'idle', submission } as const)
	}
	if (!submission.value) {
		return json(
			{
				status: 'error',
				submission,
			} as const,
			{ status: 400 },
		)
	}

	const { name, notes, status, cooldown, cooldownStartDate, cooldownEndDate } = submission.value

	const updatedHorse = await prisma.horse.update({
		where: { id: params.horseId },
		data: {
			name,
			status,
			notes,
			cooldown,
			cooldownStartDate,
			cooldownEndDate,
		},
	})

	if (!updatedHorse) {
		return redirectWithToast(`/admin/horses`, {
			title: `Error`,
			variant: 'destructive',
			description: `Failed to update horse`,
		})
	}

	return redirectWithToast(`/admin/horses`, {
		title: `Success`,
		description: `Updated ${updatedHorse.name}`,
	})
}

export default function EditHorse() {
	const data = useLoaderData<typeof loader>() || {}
	const actionData = useActionData<typeof action>()
	const [open, setOpen] = useState(true)

	const navigation = useNavigation()
	const formAction = useFormAction()

	const isSubmitting =
		navigation.state === 'submitting' &&
		navigation.formAction === formAction &&
		navigation.formMethod === 'PUT'

	const navigate = useNavigate()
	const dismissModal = () => {
		setOpen(false)
		navigate('..', { preventScrollReset: true })
	}
	const [form, fields] = useForm({
		id: 'edit-horse',
		lastSubmission: actionData?.submission,
		defaultValue: {
			name: data.horse?.name,
			status: data.horse?.status,
			notes: data.horse?.notes,
			cooldownStartDate: data.horse?.cooldownStartDate
				? format(new Date(data.horse.cooldownStartDate), 'yyyy-MM-dd')
				: null,
			cooldownEndDate: data.horse?.cooldownEndDate
				? format(new Date(data.horse.cooldownEndDate), 'yyyy-MM-dd')
				: null,
		},
		shouldRevalidate: 'onSubmit',
		onSubmit: dismissModal,
	})
	const cooldown = actionData ? actionData.submission.payload?.cooldown === 'on' ? true: false : data.horse?.cooldown
	const [cooldownChecked, setcooldownChecked] = useState(cooldown)

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent
				onEscapeKeyDown={dismissModal}
				onPointerDownOutside={dismissModal}
			>
				<DialogHeader>
					<DialogTitle>Edit Horse: {data.horse?.name}</DialogTitle>
					<DialogDescription>
						Edit this horse using this form. Click save to save your changes.
					</DialogDescription>
				</DialogHeader>
				<Form method="PUT" {...form.props}>
					<input type="hidden" name="_action" value="update" />
					<Field
						labelProps={{
							htmlFor: fields.name.id,
							children: 'Name',
						}}
						inputProps={conform.input(fields.name)}
						errors={fields.name.errors}
					/>
					<Field
						labelProps={{
							htmlFor: fields.status.id,
							children: 'Status',
						}}
						inputProps={conform.input(fields.status)}
						errors={fields.status.errors}
					/>
					<TextareaField
						labelProps={{
							htmlFor: fields.notes.id,
							children: 'Notes',
						}}
						textareaProps={conform.textarea(fields.notes)}
						errors={fields.notes.errors}
					/>
					<CheckboxField
						labelProps={{
							htmlFor: fields.cooldown.id,
							children: 'Schedule Cooldown',
						}}
						buttonProps={{
							...conform.input(fields.cooldown, {
								type: 'checkbox',
							}),
							onCheckedChange: state => {
								setcooldownChecked(Boolean(state.valueOf()))
							},
							defaultChecked: cooldownChecked,
						}}
						errors={fields.cooldown.errors}
					/>
					{cooldownChecked ? (
						<fieldset className="grid grid-cols-2 gap-x-10">
							<Field
								className="col-span-1"
								labelProps={{
									htmlFor: fields.cooldownStartDate.id,
									children: 'Start Date',
								}}
								inputProps={{
									...conform.input(fields.cooldownStartDate),
									type: 'date',
								}}
								errors={fields.cooldownStartDate.errors}
							/>

							<Field
								className="col-span-1"
								labelProps={{
									htmlFor: fields.cooldownEndDate.id,
									children: 'End Date',
								}}
								inputProps={{
									...conform.input(fields.cooldownEndDate),
									type: 'date',
								}}
								errors={fields.cooldownEndDate.errors}
							/>
						</fieldset>
					) : null}
					{form.error ? (
						<div className="min-h-[32px] px-4 pb-3 pt-1">
							{form.errorId ? <ErrorList id={form.errorId} errors={form.errors} /> : null}
						</div>
					): null}
					<DialogFooter className="mt-4">
						<StatusButton
							type="submit"
							status={isSubmitting ? 'pending' : actionData?.status ?? 'idle'}
						>
							Save
						</StatusButton>
					</DialogFooter>
				</Form>
				<DialogClose asChild>
					<button
						onClick={dismissModal}
						aria-label="Close"
						className="absolute right-10 top-10"
					>
						<Icon name="cross-1" />
					</button>
				</DialogClose>
			</DialogContent>
		</Dialog>
	)
}
