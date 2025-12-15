<script>
	import { onMount } from "svelte";

	export let urlResult;
	let textarea;

	onMount(() => {
		textarea.select();
		document.execCommand("copy");
	});
</script>

<textarea bind:value={urlResult} bind:this={textarea}></textarea>
