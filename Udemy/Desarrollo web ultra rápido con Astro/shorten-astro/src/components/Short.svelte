<script>
	import { mount } from "svelte";

	import ClipBoard from "./ClipBoard.svelte";

	let url = "";
	let urlResult = "";
	let show = false;

	const copy = () => {
		const app = mount(ClipBoard, {
			target: document.getElementById("clipboard"),
			props: {
				urlResult,
			},
		});

		app.$destroy();
	};

	const fetchUrl = async () => {
		const options = {
			method: "POST",
			headers: {
				accept: "application/json",
				"content-type": "application/json",
				Authorization: import.meta.env.SHORT_API,
			},
			body: JSON.stringify({
				originalURL: url,
				domain: import.meta.env.SHORT_DOMAIN,
			}),
		};

		const response = await fetch("https://api.short.io/links", options);
		const data = await response.json();
		if (data.error === "Unauthorized") {
			show = true;
			urlResult = "Error!";
			return;
		}

		urlResult = data.shortURL;
	};

	const styleInput =
		"bg-gray-200 appearance-none border-2 border-gray-200 rounded w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:bg-white focus:boder-purple-500";
	const buttonStyle = "bg-purple-500 hover:bg-purple-400 text-white font-bold py-2 px-10 rounded";
</script>

<div class="md:flex md:items-center mb-6">
	<div class="md:w-1/3">
		<label for="" class="block text-gray-500 font-bold md:text-right pr-4">URL to Shorten:</label>
	</div>
	<div class="md:w-1/3">
		<input
			type="text"
			placeholder="Exanple: https://www.mysite.com"
			class={styleInput}
			bind:value={url}
		/>
	</div>
</div>

<div class="md:flex md:items-center justify-center">
	<button type="button" class={buttonStyle} on:click={fetchUrl}>Shorten</button>
</div>

{#if show}
	<div class="md:flex md:items-center mt-10 justify-center">
		<input bind:value={urlResult} class="text-5xl text-pink-500" />
		<button class={buttonStyle} on:click={copy}>Copy</button>
		<div id="clipboard"></div>
	</div>
{/if}
